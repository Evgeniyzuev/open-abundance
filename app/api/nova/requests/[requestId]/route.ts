import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { actOnRequest } from "@/lib/novaRequestsServer";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
const ACTIONS = ["can", "pass", "connect", "message", "reveal", "close", "cancel"];

/**
 * POST /api/nova/requests/:id { action, offerId?, body?, helped? }
 *
 * can / pass: a helper's first consent or a quiet «not now». connect: the requester's second consent for one of the
 * people who said «Могу». message: a message passed on by Nova. reveal: agree to show your name (shown when both
 * agreed). close: leave the conversation; the requester may add whether it helped. cancel: withdraw an open request.
 */
export async function POST(request: NextRequest, { params }: { params: { requestId: string } }) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const { requestId } = params;
  if (!isUuid(requestId)) return json({ error: "Not found." }, 404);
  const payload = (await request.json().catch(() => null)) as { action?: unknown; offerId?: unknown; body?: unknown; helped?: unknown } | null;
  if (!payload || !ACTIONS.includes(String(payload.action))) return json({ error: `action: ${ACTIONS.join(", ")}.` }, 400);
  const result = await actOnRequest(createServiceSupabaseClient() as never, user.id, requestId, payload);
  if (!result.ok) return json({ error: result.error, problem: result.problem ?? null }, result.status);
  await recordProductEvent({ eventName: "nova_request_action", source: "server", userId: user.id, properties: { action: String(payload.action), ...(typeof payload.helped === "boolean" ? { helped: payload.helped } : {}) } }).catch(() => undefined);
  return json({ ok: true, id: result.id ?? null });
}
