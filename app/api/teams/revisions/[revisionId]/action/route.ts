import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RevisionActionBody = { action?: string; expectedVersion?: number | null };

export async function POST(request: NextRequest, { params }: { params: { revisionId: string } }) {
  try {
    if (!isUuid(params.revisionId)) {
      return NextResponse.json({ error: "Invalid revision id." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const body = (await request.json().catch(() => ({}))) as RevisionActionBody;
    if (body.action !== "accept" && body.action !== "decline") {
      return NextResponse.json({ error: "Invalid revision action." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const expectedVersion = body.expectedVersion == null ? null : Number(body.expectedVersion);
    if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      return NextResponse.json({ error: "Invalid task version." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { data, error: responseError } = await supabase.rpc("respond_team_task_revision", {
      p_actor_user_id: user.id,
      p_revision_id: params.revisionId,
      p_action: body.action,
      p_expected_version: expectedVersion
    });
    if (responseError) {
      return NextResponse.json({ error: responseError.message }, { status: mapErrorStatus(responseError.code), headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to respond to task changes." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function mapErrorStatus(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  if (code === "40001") return 409;
  return 500;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
