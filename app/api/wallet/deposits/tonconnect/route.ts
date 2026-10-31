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
/** Same as the binding invoice of the deposit screen; only the comment matters here, the amount is the person's. */
const BINDING_AMOUNT_USDT = "1";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

type Body = { asset?: unknown; invoiceId?: unknown; senderAddress?: unknown; amount?: unknown };

/**
 * POST /api/wallet/deposits/tonconnect  { asset: "TON" | "USDT", invoiceId?, senderAddress, amount? }
 *
 * Builds the transaction that the person's own wallet (connected through TON Connect) shows ready to confirm: our
 * deposit address, the amount and the invoice comment. Nothing is credited here: the payment is credited by the usual
 * TON or USDT scanner when it reaches the chain, exactly as a payment typed by hand. USDT without an invoice is
 * pays without a comment from a sender address already bound to this account; from any other wallet it carries the
 * comment of the person's open invoice, and the settlement links that wallet for next time.
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
    if (!asset) return json({ error: "Unknown asset.", code: "unknown_asset" }, 400);

    if (asset === "TON") {
      const config = await loadTonDepositConfig(supabase);
      if (!config || !invoiceId) return json({ error: "TON deposit is not available.", code: "unavailable" }, 400);
      const { data: invoice } = await db.from("ton_deposit_invoices").select("id,user_id,invoice_code,deposit_address,expected_amount_nano,status")
        .eq("id", invoiceId).eq("user_id", user.id).maybeSingle();
      if (!invoice || !TON_PAYABLE.includes(invoice.status)) return json({ error: "The invoice is no longer open. Create a new one.", code: "invoice_closed" }, 409);
      const expected = invoice.expected_amount_nano != null ? String(invoice.expected_amount_nano) : null;
      const nano = amount ? tonAmountToNano(amount) : expected;
      if (!nano) return json({ error: "Enter the amount in TON.", code: "amount" }, 400);
      if (!normalizeTonAddress(invoice.deposit_address)) return json({ error: "TON deposit is not available.", code: "unavailable" }, 400);
      return json({
        transaction: {
          validUntil: Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS,
          network: tonConnectChain(config.network),
          messages: [{ address: invoice.deposit_address, amount: nano, payload: commentPayload(invoice.invoice_code) }]
        }
      });
    }

    const config = await loadTonUsdtConfig(db);
    if (!config?.ready) return json({ error: "TON USDT deposit is not configured yet.", code: "unavailable" }, 503);
    const sender = normalizeTonUsdtAddress(body.senderAddress, config.network);
    if (!sender) return json({ error: "Connect a TON wallet first.", code: "no_wallet" }, 400);

    let comment: string | null = null;
    let linking = false;
    let units: string | null = amount ? parseTonUsdtUnits(amount, config.decimals) : null;
    if (invoiceId) {
      const { data: invoice } = await db.from("ton_usdt_deposit_invoices").select("id,user_id,invoice_code,expected_amount_units,status")
        .eq("id", invoiceId).eq("user_id", user.id).maybeSingle();
      if (!invoice || !USDT_PAYABLE.includes(invoice.status)) return json({ error: "The invoice is no longer open. Create a new one.", code: "invoice_closed" }, 409);
      comment = invoice.invoice_code;
      if (!units && invoice.expected_amount_units != null) units = String(invoice.expected_amount_units);
    } else {
      // Without an invoice the payment is matched by its sender, so only a bound address may pay this way.
      const { data: bound } = await db.from("ton_usdt_bound_senders").select("user_id").eq("sender_owner_address", sender.raw).eq("network", config.network).maybeSingle();
      if (bound && bound.user_id !== user.id) return json({ error: "This wallet is linked to another account.", code: "bound_elsewhere" }, 409);
      if (!bound) {
        // A wallet that is not linked yet pays with the comment of the person's open invoice. The comment credits the
        // payment to this account, and the settlement then links the sender, so the next payment needs no comment.
        const { data: rows, error: invoiceError } = await db.rpc("create_or_reuse_ton_usdt_deposit_invoice", {
          p_user_id: user.id,
          p_network: config.network,
          p_master_address: config.masterAddress,
          p_invoice_code: `oa_usdt_${crypto.randomUUID()}`,
          p_deposit_owner_address: config.depositOwnerAddress,
          p_deposit_jetton_wallet_address: config.depositJettonWalletAddress,
          p_expected_amount_units: parseTonUsdtUnits(BINDING_AMOUNT_USDT, config.decimals),
          p_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
          p_replace_active: false
        });
        const invoice = rows?.[0];
        if (invoiceError || !invoice?.invoice_code || !USDT_PAYABLE.includes(invoice.status)) return json({ error: "Could not prepare the payment.", code: "invoice_failed" }, 500);
        comment = invoice.invoice_code;
        linking = true;
      }
    }
    if (!units || units === "0") return json({ error: "Enter the amount in USDT.", code: "amount" }, 400);

    const jettonWallet = await tonUsdtJettonWalletOf(config, sender.raw);
    return json({
      linking,
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
    return json({ error: routeError instanceof Error ? routeError.message : "Could not prepare the payment.", code: "failed" }, 500);
  }
}
