import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  buildTonTransferLink,
  loadTonDepositConfig,
  parsePositiveNanoTon,
  postgresNumericToString
} from "@/lib/tonDeposits";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CreateDepositBody = {
  expectedAmountNano?: unknown;
  replaceActive?: unknown;
};

const TON_INVOICE_SELECT = "id,user_id,network,asset_code,invoice_code,deposit_address,expected_amount_nano,status,expires_at,created_at,updated_at";
const TON_VISIBLE_STATUSES = [
  "ready",
  "detected",
  "finalizing",
  "confirmed_pending_credit",
  "awaiting_rate",
  "credited",
  "credited_late",
  "credited_amount_mismatch",
  "rejected",
  "cancelled",
  "expired"
];

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
    const replaceActive = body.replaceActive === true;
    const expectedAmountNano = body.expectedAmountNano === undefined || body.expectedAmountNano === null || body.expectedAmountNano === ""
      ? null
      : parsePositiveNanoTon(body.expectedAmountNano);

    if (body.expectedAmountNano !== undefined && body.expectedAmountNano !== null && body.expectedAmountNano !== "" && !expectedAmountNano) {
      return jsonResponse({ error: "Expected TON amount must be a positive integer in nanoTON." }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const invoiceCode = `oa_ton_${crypto.randomUUID()}`;

    const { data: invoiceRows, error: createError } = await supabase.rpc(
      "create_or_reuse_ton_deposit_invoice",
      {
        p_user_id: user.id,
        p_network: config.network,
        p_asset_code: config.asset_code,
        p_invoice_code: invoiceCode,
        p_deposit_address: config.deposit_address,
        p_expected_amount_nano: expectedAmountNano,
        p_expires_at: expiresAt,
        p_replace_active: replaceActive
      }
    );
    const invoice = invoiceRows?.[0];

    if (createError || !invoice) {
      return jsonResponse({ error: createError?.message ?? "Failed to create TON deposit invoice." }, { status: 500 });
    }

    return jsonResponse({
      invoice: presentInvoice(invoice),
      reused: invoice.reused
    }, { status: invoice.reused ? 200 : 201 });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to create TON deposit invoice." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const activeOnly = request.nextUrl.searchParams.get("active") === "true";
    const limit = activeOnly ? 1 : clampLimit(request.nextUrl.searchParams.get("limit"));
    let query = supabase
      .from("ton_deposit_invoices")
      .select(TON_INVOICE_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (activeOnly) {
      query = query
        .in("status", TON_VISIBLE_STATUSES);
    }

    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) return jsonResponse({ error: invoicesError.message }, { status: 500 });
    if (activeOnly) {
      const invoice = invoices?.[0] ?? null;
      const { data: event, error: eventError } = invoice
        ? await supabase
            .from("ton_chain_events")
            .select("transaction_hash,amount_nano,status,rejection_reason,settled_usd_amount,settled_at,ton_usd_rate,rate_provider,finalized_at")
            .eq("invoice_code", invoice.invoice_code)
            .order("settled_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null, error: null };
      if (eventError) return jsonResponse({ error: eventError.message }, { status: 500 });

      return jsonResponse({
        invoice: invoice ? presentInvoice(invoice) : null,
        event: event ? presentEvent(event) : null
      });
    }
    return jsonResponse({ invoices: invoices ?? [] });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to load TON deposits." }, { status: 500 });
  }
}

function presentInvoice<T extends {
  invoice_code: string;
  deposit_address: string;
  expected_amount_nano: unknown;
}>(invoice: T) {
  const expectedAmountNano = postgresNumericToString(invoice.expected_amount_nano);
  return {
    ...invoice,
    expected_amount_nano: expectedAmountNano,
    comment: invoice.invoice_code,
    transferLink: buildTonTransferLink(
      invoice.deposit_address,
      invoice.invoice_code,
      expectedAmountNano
    )
  };
}

function presentEvent<T extends {
  amount_nano: unknown;
  settled_usd_amount: unknown;
  ton_usd_rate: unknown;
}>(event: T) {
  return {
    ...event,
    amount_nano: postgresNumericToString(event.amount_nano) ?? "0",
    settled_usd_amount: postgresNumericToString(event.settled_usd_amount),
    ton_usd_rate: postgresNumericToString(event.ton_usd_rate)
  };
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}
