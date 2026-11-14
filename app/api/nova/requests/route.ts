import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createRequest, loadRequestsFor } from "@/lib/novaRequestsServer";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

/** GET /api/nova/requests: the person's own requests, connections where they help, and requests they may answer. */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  return json(await loadRequestsFor(createServiceSupabaseClient() as never, user.id));
}

/** POST /api/nova/requests { kind, body }: a new request. Nova passes it on without the person's name. */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const payload = (await request.json().catch(() => null)) as { kind?: unknown; body?: unknown } | null;
  const result = await createRequest(createServiceSupabaseClient() as never, user.id, payload ?? {});
  if (!result.ok) return json({ error: result.error, problem: result.problem ?? null }, result.status);
  await recordProductEvent({ eventName: "nova_request_created", source: "server", userId: user.id, properties: { kind: String(payload?.kind) } }).catch(() => undefined);
  return json({ id: result.id }, 201);
}
