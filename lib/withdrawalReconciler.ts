import { mnemonicToPrivateKey } from "@ton/crypto";
import { Address, Cell, WalletContractV4 } from "@ton/ton";
import { loadTonWithdrawalConfig } from "@/lib/tonWithdrawals";

/**
 * Settles crypto withdrawals against the blockchain.
 *
 * The operating wallet signs every payout with a message that is valid for about
 * one minute. After that window a message that is not in the wallet's history can
 * never be processed, so refunding it cannot lead to a double payment. A transfer
 * that is found is confirmed. Everything unclear goes to manual review.
 */

type Asset = "TON" | "USDT";
type Outcome = "confirmed" | "refunded" | "manual_review" | "pending";

type WithdrawalRecord = {
  id: string;
  asset: Asset;
  status: string;
  errorCode: string | null;
  normalizedDestination: string;
  amountUnits: string;
  startedAt: number;
};

type TonCenterMessage = {
  destination?: string;
  value?: string;
  message?: string;
  msg_data?: { "@type"?: string; text?: string; body?: string };
};

type TonCenterTransaction = {
  utime?: number;
  transaction_id?: { lt?: string; hash?: string };
  fee?: string;
  out_msgs?: TonCenterMessage[];
};

export type ReconcileSummary = {
  checked: number;
  confirmed: number;
  refunded: number;
  manualReview: number;
  pending: number;
  skippedReason?: string;
};

const MIN_CONFIRM_AGE_MS = 20_000;
const REFUND_AFTER_MS = 10 * 60_000;
const BROADCASTING_STALE_MS = 10 * 60_000;
const UNRESOLVED_AFTER_MS = 24 * 60 * 60_000;
const WINDOW_MARGIN_S = 180;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const JETTON_TRANSFER_OP = 0x0f8a7ea5;
// A native TON transfer arrives slightly below the requested amount because the
// forward fee is deducted from the message value (observed ~0.0001 TON on mainnet).
const NATIVE_VALUE_TOLERANCE_NANO = BigInt(5_000_000);
// Unresolved reviews are re-checked every few minutes instead of every minute.
const UNRESOLVED_RECHECK_MINUTES = 10;

type AnySupabase = Record<string, any>;

export async function reconcileWithdrawals(supabase: AnySupabase, notifyOperators: (id: string, asset: Asset, reason: string) => Promise<void>): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, confirmed: 0, refunded: 0, manualReview: 0, pending: 0 };
  const records = await loadCandidates(supabase);
  if (records.length === 0) return summary;

  const config = loadTonWithdrawalConfig();
  if (!config.mnemonic) return { ...summary, skippedReason: "signer_not_configured" };

  const keyPair = await mnemonicToPrivateKey(config.mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const operatingAddress = wallet.address.toRawString();

  const earliest = Math.min(...records.map((record) => record.startedAt));
  let history: { transactions: TonCenterTransaction[]; covered: boolean };
  try {
    history = await loadWalletHistory(config.endpoint, config.apiKey, operatingAddress, Math.floor(earliest / 1000) - WINDOW_MARGIN_S);
  } catch {
    return { ...summary, checked: records.length, pending: records.length, skippedReason: "history_unavailable" };
  }

  const now = Date.now();
  for (const record of records) {
    summary.checked += 1;
    const age = now - record.startedAt;
    const match = findTransfer(history.transactions, record);

    let outcome: Outcome = "pending";
    let transactionHash = "";
    let message = "";
    let actualFeeTon: number | null = null;
    if (match.found) {
      if (age >= MIN_CONFIRM_AGE_MS) {
        outcome = "confirmed";
        transactionHash = match.transactionHash;
        // Only native TON payouts release unused fee reserve: a Jetton payout also pays gas
        // inside the Jetton wallet, which cannot be attributed from the operating wallet alone.
        actualFeeTon = record.asset === "TON" ? match.feeTon : null;
      }
    } else if (match.anomaly) {
      outcome = "manual_review";
      message = match.anomaly;
    } else if (age >= REFUND_AFTER_MS && history.covered) {
      outcome = "refunded";
      message = "Signed message expired and was not found in the operating wallet history.";
    } else if (age >= UNRESOLVED_AFTER_MS) {
      outcome = "manual_review";
      message = "Transfer could not be matched on chain within 24 hours.";
    }

    if (outcome === "pending") {
      summary.pending += 1;
      continue;
    }

    const rpc = record.asset === "TON" ? "reconcile_settle_ton_withdrawal" : "reconcile_settle_ton_usdt_withdrawal";
    const { data, error } = await supabase.rpc(rpc, {
      p_withdrawal_id: record.id,
      p_outcome: outcome,
      p_transaction_hash: transactionHash,
      p_message: message,
      ...(record.asset === "TON" ? { p_actual_fee_ton: actualFeeTon } : {})
    });
    if (error) {
      summary.pending += 1;
      continue;
    }
    const settled = String(data ?? "");
    if (settled === "confirmed") summary.confirmed += 1;
    else if (settled === "refunded") summary.refunded += 1;
    else if (settled === "manual_review") {
      summary.manualReview += 1;
      if (record.status !== "manual_review" || record.errorCode !== "reconcile_unresolved") await notifyOperators(record.id, record.asset, message);
    }
  }
  return summary;
}

async function loadCandidates(supabase: AnySupabase): Promise<WithdrawalRecord[]> {
  const now = Date.now();
  const records: WithdrawalRecord[] = [];
  const specs: Array<{ table: string; asset: Asset; amountColumn: string }> = [
    { table: "ton_withdrawals", asset: "TON", amountColumn: "amount_nano" },
    { table: "ton_usdt_withdrawals", asset: "USDT", amountColumn: "amount_units" }
  ];
  for (const spec of specs) {
    const { data, error } = await supabase
      .from(spec.table)
      .select(`id,status,error_code,normalized_destination_address,${spec.amountColumn},created_at,broadcast_at`)
      .in("status", ["broadcasting", "broadcast", "manual_review"])
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const startedAt = Date.parse(String(row.broadcast_at ?? row.created_at));
      if (!Number.isFinite(startedAt)) continue;
      const status = String(row.status);
      if (status === "manual_review") {
        const unclearBroadcast = row.error_code === "broadcast_unknown";
        const recheckUnresolved = row.error_code === "reconcile_unresolved" && Math.floor(now / 60_000) % UNRESOLVED_RECHECK_MINUTES === 0;
        if (!unclearBroadcast && !recheckUnresolved) continue;
      }
      if (status === "broadcasting" && now - startedAt < BROADCASTING_STALE_MS) continue;
      records.push({
        id: String(row.id),
        asset: spec.asset,
        status,
        errorCode: (row.error_code as string | null) ?? null,
        normalizedDestination: String(row.normalized_destination_address),
        amountUnits: String(row[spec.amountColumn]),
        startedAt
      });
    }
  }
  return records;
}

async function loadWalletHistory(endpoint: string, apiKey: string | undefined, address: string, coverUntilSeconds: number) {
  const base = endpoint.replace(/\/+$/, "").replace(/\/jsonRPC$/i, "");
  const headers: Record<string, string> = apiKey ? { "X-API-Key": apiKey } : {};
  const transactions: TonCenterTransaction[] = [];
  let next: { lt: string; hash: string } | null = null;
  let covered = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${base}/getTransactions`);
    url.searchParams.set("address", address);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("archival", "true");
    if (next) {
      url.searchParams.set("lt", next.lt);
      url.searchParams.set("hash", next.hash);
    }
    const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: TonCenterTransaction[]; previous_transaction?: { lt?: string; hash?: string } };
    if (!response.ok || payload.ok === false || !Array.isArray(payload.result)) throw new Error("TON Center history request failed.");

    transactions.push(...payload.result);
    const oldest = payload.result[payload.result.length - 1];
    if (payload.result.length < PAGE_SIZE) {
      covered = true;
      break;
    }
    if (oldest?.utime !== undefined && oldest.utime <= coverUntilSeconds) {
      covered = true;
      break;
    }
    const lt = payload.previous_transaction?.lt;
    const hash = payload.previous_transaction?.hash;
    if (!lt || !hash) break;
    next = { lt, hash };
  }
  return { transactions, covered };
}

type MatchResult = { found: true; transactionHash: string; feeTon: number | null; anomaly?: undefined } | { found: false; anomaly?: string };

function findTransfer(transactions: TonCenterTransaction[], record: WithdrawalRecord): MatchResult {
  const expectedComment = record.asset === "TON" ? `OA withdrawal ${record.id}` : `OA USDT withdrawal ${record.id}`;
  for (const transaction of transactions) {
    for (const message of transaction.out_msgs ?? []) {
      const parsed = record.asset === "TON" ? parseNativeMessage(message) : parseJettonMessage(message);
      if (!parsed || parsed.comment !== expectedComment) continue;
      const sameDestination = safeRaw(parsed.destination) === safeRaw(record.normalizedDestination);
      const sameAmount = amountMatches(record.asset, parsed.amount, record.amountUnits);
      if (!sameDestination || !sameAmount) {
        return {
          found: false,
          anomaly: `A transfer with this withdrawal comment exists but its destination or amount differs (destination match: ${sameDestination}, expected amount ${record.amountUnits}, found ${parsed.amount}).`
        };
      }
      const feeNano = Number(transaction.fee);
      return { found: true, transactionHash: transaction.transaction_id?.hash ?? "", feeTon: Number.isFinite(feeNano) && feeNano > 0 ? feeNano / 1e9 : null };
    }
  }
  return { found: false };
}

function amountMatches(asset: Asset, found: string, expected: string): boolean {
  try {
    const actual = BigInt(found);
    const wanted = BigInt(expected);
    if (asset === "USDT") return actual === wanted;
    return actual <= wanted && wanted - actual <= NATIVE_VALUE_TOLERANCE_NANO;
  } catch {
    return false;
  }
}

function parseNativeMessage(message: TonCenterMessage): { comment: string; destination: string; amount: string } | null {
  const comment = message.message ?? decodeText(message.msg_data);
  if (!comment || !message.destination) return null;
  return { comment, destination: message.destination, amount: String(message.value ?? "") };
}

function parseJettonMessage(message: TonCenterMessage): { comment: string; destination: string; amount: string } | null {
  const body = message.msg_data?.body;
  if (!body) return null;
  try {
    const slice = Cell.fromBase64(body).beginParse();
    if (slice.loadUint(32) !== JETTON_TRANSFER_OP) return null;
    slice.loadUint(64);
    const amount = slice.loadCoins();
    const destination = slice.loadAddress();
    slice.loadMaybeAddress();
    slice.loadBit();
    slice.loadCoins();
    const eitherRef = slice.loadBit();
    const payload = eitherRef ? slice.loadRef().beginParse() : slice;
    if (payload.loadUint(32) !== 0) return null;
    return { comment: payload.loadStringTail(), destination: destination.toRawString(), amount: amount.toString() };
  } catch {
    return null;
  }
}

function decodeText(data: TonCenterMessage["msg_data"]): string | null {
  if (!data?.text) return null;
  try {
    return Buffer.from(data.text, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function safeRaw(value: string): string {
  try {
    return Address.parse(value).toRawString();
  } catch {
    return value;
  }
}
