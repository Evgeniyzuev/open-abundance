import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTonTransferLink } from "@/lib/tonDeposits";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers
    }
  });
}

export async function GET(request: NextRequest, { params }: { params: { depositId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const { data: invoice, error: invoiceError } = await supabase
      .from("ton_deposit_invoices")
      .select("id,user_id,network,asset_code,invoice_code,deposit_address,expected_amount_nano,status,expires_at,created_at,updated_at")
      .eq("id", params.depositId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invoiceError) return jsonResponse({ error: invoiceError.message }, { status: 500 });
    if (!invoice) return jsonResponse({ error: "TON deposit invoice not found." }, { status: 404 });

    const { data: events, error: eventsError } = await supabase
      .from("ton_chain_events")
      .select("id,network,asset_code,transaction_hash,logical_time,message_index,sender_address,receiver_address,amount_nano,comment,invoice_code,status,rejection_reason,finalized_at,ton_usd_rate,rate_provider,rate_source_timestamp,settled_usd_amount,settled_at,created_at,updated_at")
      .eq("invoice_code", invoice.invoice_code)
      .order("settled_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (eventsError) return jsonResponse({ error: eventsError.message }, { status: 500 });

    return jsonResponse({
      invoice: {
        ...invoice,
        comment: invoice.invoice_code,
        transferLink: buildTonTransferLink(invoice.deposit_address, invoice.invoice_code, invoice.expected_amount_nano ? String(invoice.expected_amount_nano) : null)
      },
      event: events?.[0] ?? null,
      events: events ?? []
    });
  } catch (routeError) {
    return jsonResponse({ error: routeError instanceof Error ? routeError.message : "Failed to load TON deposit." }, { status: 500 });
  }
}
