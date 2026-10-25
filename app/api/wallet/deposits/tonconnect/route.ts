import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { tonAmountToNano } from "@/lib/tonAmount";
import { loadTonDepositConfig, normalizeTonAddress } from "@/lib/tonDeposits";
import { commentPayload, jettonTransferPayload, nanoFromTon, tonConnectChain } from "@/lib/tonConnectPayload";
import { loadTonUsdtConfig, normalizeTonUsdtAddress, parseTonUsdtUnits, tonUsdtJettonWalletOf } from "@/lib/tonUsdt";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/** How long the wallet may take to send the prepared transaction. */
const VALID_FOR_SECONDS = 5 * 60;
const TON_PAYABLE = ["ready"];
const USDT_PAYABLE = ["waiting"];

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

type Body = { asset?: unknown; invoiceId?: unknown; senderAddress?: unknown; amount?: unknown };

/**
 * POST /api/wallet/deposits/tonconnect  { asset: "TON" | "USDT", invoiceId?, senderAddress, amount? }
 *
 * Builds the transaction that the person's own wallet (connected through TON Connect) shows ready to confirm: our
 * deposit address, the amount and the invoice comment. Nothing is credited here: the payment is credited by the usual
 * TON or USDT scanner when it reaches the chain, exactly as a payment typed by hand. USDT without an invoice is
 * allowed only from a sender address already bound to this account (such payments need no comment).
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return json({ error }, 401);
    const body = (await request.json().catch(() => ({}))) as Body;
    const asset = body.asset === "USDT" ? "USDT" : body.asset === "TON" ? "TON" : null;
    const invoiceId = typeof body.invoiceId === "string" && /^[0-9a-f-]{36}$/i.test(body.invoiceId) ? body.invoiceId : null;
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    const db = supabase as any;
    if (!asset) return json({ error: "Unknown asset." }, 400);

    if (asset === "TON") {
      const config = await loadTonDepositConfig(supabase);
      if (!config || !invoiceId) return json({ error: "TON deposit is not available." }, 400);
      const { data: invoice } = await db.from("ton_deposit_invoices").select("id,user_id,invoice_code,deposit_address,expected_amount_nano,status")
        .eq("id", invoiceId).eq("user_id", user.id).maybeSingle();
      if (!invoice || !TON_PAYABLE.includes(invoice.status)) return json({ error: "The invoice is no longer open. Create a new one." }, 409);
      const expected = invoice.expected_amount_nano != null ? String(invoice.expected_amount_nano) : null;
      const nano = amount ? tonAmountToNano(amount) : expected;
      if (!nano) return json({ error: "Enter the amount in TON." }, 400);
      if (!normalizeTonAddress(invoice.deposit_address)) return json({ error: "TON deposit is not available." }, 400);
      return json({
        transaction: {
          validUntil: Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS,
          network: tonConnectChain(config.network),
          messages: [{ address: invoice.deposit_address, amount: nano, payload: commentPayload(invoice.invoice_code) }]
        }
      });
    }

    const config = await loadTonUsdtConfig(db);
    if (!config?.ready) return json({ error: "TON USDT deposit is not configured yet." }, 503);
    const sender = normalizeTonUsdtAddress(body.senderAddress, config.network);
    if (!sender) return json({ error: "Connect a TON wallet first." }, 400);

    let comment: string | null = null;
    let units: string | null = amount ? parseTonUsdtUnits(amount, config.decimals) : null;
    if (invoiceId) {
      const { data: invoice } = await db.from("ton_usdt_deposit_invoices").select("id,user_id,invoice_code,expected_amount_units,status")
        .eq("id", invoiceId).eq("user_id", user.id).maybeSingle();
      if (!invoice || !USDT_PAYABLE.includes(invoice.status)) return json({ error: "The invoice is no longer open. Create a new one." }, 409);
      comment = invoice.invoice_code;
      if (!units && invoice.expected_amount_units != null) units = String(invoice.expected_amount_units);
    } else {
      // Without an invoice the payment is matched by its sender, so only a bound address may pay this way.
      const { data: bound } = await db.from("ton_usdt_bound_senders").select("user_id").eq("sender_owner_address", sender.raw).eq("network", config.network).maybeSingle();
      if (!bound || bound.user_id !== user.id) return json({ error: "This wallet is not linked yet. Pay once with the invoice comment.", code: "not_bound" }, 409);
    }
    if (!units || units === "0") return json({ error: "Enter the amount in USDT." }, 400);

    const jettonWallet = await tonUsdtJettonWalletOf(config, sender.raw);
    return json({
      transaction: {
        validUntil: Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS,
        network: tonConnectChain(config.network),
        from: sender.raw,
        messages: [{
          address: jettonWallet,
          amount: nanoFromTon(config.transferTonAmount),
          payload: jettonTransferPayload({ amountUnits: units, destinationOwner: config.depositOwnerAddress, responseOwner: sender.raw, comment, queryId: BigInt(Date.now()) })
        }]
      }
    });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Could not prepare the payment." }, 500);
  }
}
