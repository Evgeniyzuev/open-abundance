import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { buildTonTransferLink } from "@/lib/tonDeposits";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

export async function POST(request: NextRequest, { params }: { params: { depositId: string } }) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return jsonResponse({ error }, { status: 401 });

    const { data: existingInvoice, error: invoiceError } = await supabase
      .from("ton_deposit_invoices")
      .select("id,status")
      .eq("id", params.depositId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invoiceError) return jsonResponse({ error: invoiceError.message }, { status: 500 });
    if (!existingInvoice) return jsonResponse({ error: "TON deposit invoice not found." }, { status: 404 });
    if (existingInvoice.status !== "waiting") {
      return jsonResponse({ error: "Only a waiting TON deposit invoice can be resumed." }, { status: 409 });
    }

    const { error: resumeError } = await supabase.rpc("start_ton_invoice_scan", {
      p_invoice_id: existingInvoice.id,
      p_reset: true
    });
    if (resumeError) return jsonResponse({ error: resumeError.message }, { status: 500 });

    const { data: invoice, error: reloadError } = await supabase
      .from("ton_deposit_invoices")
      .select(TON_INVOICE_SELECT)
      .eq("id", existingInvoice.id)
      .single();

    if (reloadError || !invoice) {
      return jsonResponse({ error: reloadError?.message ?? "Failed to reload TON deposit invoice." }, { status: 500 });
    }

    return jsonResponse({
      invoice: {
        ...invoice,
        comment: invoice.invoice_code,
        transferLink: buildTonTransferLink(
          invoice.deposit_address,
          invoice.invoice_code,
          invoice.expected_amount_nano
        )
      }
    });
  } catch (routeError) {
    return jsonResponse({
      error: routeError instanceof Error ? routeError.message : "Failed to resume TON deposit invoice."
    }, { status: 500 });
  }
}
