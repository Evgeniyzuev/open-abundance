import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTonTransferLink, loadTonDepositConfig, parsePositiveNanoTon } from "@/lib/tonDeposits";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CreateDepositBody = {
  expectedAmountNano?: unknown;
};

const TON_INVOICE_WINDOW_SECONDS = 110;
const TON_INVOICE_SELECT = "id,user_id,network,asset_code,invoice_code,deposit_address,expected_amount_nano,status,expires_at,created_at,updated_at";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const config = await loadTonDepositConfig(supabase);
    if (!config) return jsonResponse({ error: "TON deposit is not configured yet." }, { status: 503 });

    const body = (await request.json().catch(() => ({}))) as CreateDepositBody;
    const expectedAmountNano = body.expectedAmountNano === undefined || body.expectedAmountNano === null || body.expectedAmountNano === ""
      ? null
      : parsePositiveNanoTon(body.expectedAmountNano);

    if (body.expectedAmountNano !== undefined && body.expectedAmountNano !== null && body.expectedAmountNano !== "" && !expectedAmountNano) {
      return jsonResponse({ error: "Expected TON amount must be a positive integer in nanoTON." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TON_INVOICE_WINDOW_SECONDS * 1000).toISOString();

    const { error: expireError } = await supabase
      .from("ton_deposit_invoices")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("network", config.network)
      .eq("asset_code", config.asset_code)
      .eq("status", "waiting")
      .lte("expires_at", nowIso);

    if (expireError) return jsonResponse({ error: expireError.message }, { status: 500 });

    async function reuseWaitingInvoice(invoiceId: string) {
      const { error: updateError } = await supabase
        .from("ton_deposit_invoices")
        .update({
          expected_amount_nano: expectedAmountNano,
          expires_at: expiresAt
        })
        .eq("id", invoiceId)
        .eq("status", "waiting");

      if (updateError) return jsonResponse({ error: updateError.message }, { status: 500 });

      const { error: restartError } = await supabase.rpc("start_ton_invoice_scan", {
        p_invoice_id: invoiceId,
        p_reset: true
      });

      if (restartError) return jsonResponse({ error: restartError.message }, { status: 500 });

      const { data: refreshedInvoice, error: refreshError } = await supabase
        .from("ton_deposit_invoices")
        .select(TON_INVOICE_SELECT)
        .eq("id", invoiceId)
        .single();

      if (refreshError || !refreshedInvoice) {
        return jsonResponse({ error: refreshError?.message ?? "Failed to refresh TON deposit invoice." }, { status: 500 });
      }

      return jsonResponse({
        invoice: {
          ...refreshedInvoice,
          comment: refreshedInvoice.invoice_code,
          transferLink: buildTonTransferLink(refreshedInvoice.deposit_address, refreshedInvoice.invoice_code, expectedAmountNano)
        }
      });
    }

    const { data: activeInvoice, error: activeInvoiceError } = await supabase
      .from("ton_deposit_invoices")
      .select(TON_INVOICE_SELECT)
      .eq("user_id", user.id)
      .eq("network", config.network)
      .eq("asset_code", config.asset_code)
      .eq("status", "waiting")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeInvoiceError) return jsonResponse({ error: activeInvoiceError.message }, { status: 500 });

    if (activeInvoice) {
      return reuseWaitingInvoice(activeInvoice.id);
    }

    const invoiceCode = `oa_ton_${crypto.randomUUID()}`;

    const { data: invoice, error: insertError } = await supabase
      .from("ton_deposit_invoices")
      .insert({
        user_id: user.id,
        network: config.network,
        asset_code: config.asset_code,
        invoice_code: invoiceCode,
        deposit_address: config.deposit_address,
        expected_amount_nano: expectedAmountNano,
        expires_at: expiresAt
      })
      .select(TON_INVOICE_SELECT)
      .single();

    if (insertError?.code === "23505") {
      const { data: concurrentInvoice, error: concurrentError } = await supabase
        .from("ton_deposit_invoices")
        .select("id")
        .eq("user_id", user.id)
        .eq("network", config.network)
        .eq("asset_code", config.asset_code)
        .eq("status", "waiting")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (concurrentError || !concurrentInvoice) {
        return jsonResponse({ error: concurrentError?.message ?? insertError.message }, { status: 500 });
      }

      return reuseWaitingInvoice(concurrentInvoice.id);
    }

    if (insertError || !invoice) return jsonResponse({ error: insertError?.message ?? "Failed to create TON deposit invoice." }, { status: 500 });

    return jsonResponse({
      invoice: {
        ...invoice,
        comment: invoice.invoice_code,
        transferLink: buildTonTransferLink(invoice.deposit_address, invoice.invoice_code, expectedAmountNano)
      }
    }, { status: 201 });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to create TON deposit invoice." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const { data: invoices, error: invoicesError } = await supabase
      .from("ton_deposit_invoices")
      .select(TON_INVOICE_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (invoicesError) return jsonResponse({ error: invoicesError.message }, { status: 500 });
    return jsonResponse({ invoices: invoices ?? [] });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to load TON deposits." }, { status: 500 });
  }
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}
