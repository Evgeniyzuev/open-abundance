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

    const expiryMinutes = clampExpiryMinutes(process.env.TON_DEPOSIT_INVOICE_MINUTES);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
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
      .select("id,user_id,network,asset_code,invoice_code,deposit_address,expected_amount_nano,status,expires_at,created_at,updated_at")
      .single();

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
      .select("id,user_id,network,asset_code,invoice_code,deposit_address,expected_amount_nano,status,expires_at,created_at,updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (invoicesError) return jsonResponse({ error: invoicesError.message }, { status: 500 });
    return jsonResponse({ invoices: invoices ?? [] });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to load TON deposits." }, { status: 500 });
  }
}

function clampExpiryMinutes(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(5, Math.min(24 * 60, Math.floor(parsed)));
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}
