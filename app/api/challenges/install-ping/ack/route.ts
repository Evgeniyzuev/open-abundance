import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/challenges/install-ping/ack  { pingId }
 *
 * Confirms that the participant opened the app within 3 minutes of a ping. The time window and
 * ownership are enforced in the database function. The reward is claimed afterwards through the
 * normal challenge check, which reads the stored confirmation.
 */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

  const body = (await request.json().catch(() => null)) as { pingId?: unknown } | null;
  const pingId = typeof body?.pingId === "string" && isUuid(body.pingId) ? body.pingId : null;
  if (!pingId) return NextResponse.json({ error: "Invalid ping." }, { status: 400, headers: NO_STORE_HEADERS });

  const { data, error: ackError } = await (supabase as any).rpc("acknowledge_install_ping", { p_user_id: user.id, p_job_id: pingId });
  if (ackError) return NextResponse.json({ error: "Could not confirm." }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ result: data }, { headers: NO_STORE_HEADERS });
}
