import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { fetchDiditSessionStatus, loadDiditConfig, verifyDiditWebhook } from "@/lib/humanity";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/humanity/webhook/didit
 *
 * Didit status webhook. The signature (X-Signature-V2) and freshness are checked first. The decision
 * is then read back from Didit with our own API key, so the webhook body never grants a level by
 * itself, and the attempt that was created for this user decides who is confirmed.
 */
export async function POST(request: NextRequest) {
  const config = loadDiditConfig();
  if (!config?.webhookSecret) return json({ error: "Not configured." }, 503);

  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid body." }, 400);
  }
  if (!verifyDiditWebhook(body, request.headers, config.webhookSecret)) return json({ error: "Invalid signature." }, 401);

  if (body.webhook_type !== "status.updated") return json({ ok: true, ignored: true }, 200);
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!sessionId || !status) return json({ ok: true, ignored: true }, 200);

  // Anything that can raise a level is confirmed with the provider before it is applied.
  let confirmedStatus = status;
  if (status === "Approved") {
    const decision = await fetchDiditSessionStatus(config, sessionId);
    if (!decision || decision.status !== "Approved") return json({ error: "Decision could not be confirmed." }, 502);
    confirmedStatus = decision.status;
  }

  const eventId = typeof body.event_id === "string" && body.event_id ? body.event_id : `${sessionId}:${confirmedStatus}`;
  const db = createServiceSupabaseClient() as any;
  const { data, error } = await db.rpc("apply_humanity_result", {
    p_provider: "didit",
    p_session_id: sessionId,
    p_event_id: eventId,
    p_status: confirmedStatus
  });
  if (error) return json({ error: "Could not apply the result." }, 500);
  return json({ ok: true, result: data }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
