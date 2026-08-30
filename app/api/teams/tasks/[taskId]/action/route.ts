import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const ACTIONS = new Set(["accept", "decline", "submit", "complete", "return", "cancel"]);

type ActionRequest = {
  action?: string;
  expectedVersion?: number | null;
  submission?: string | null;
};

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    if (!isUuid(params.taskId)) {
      return NextResponse.json({ error: "Invalid task id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as ActionRequest;
    const action = body.action?.trim() ?? "";
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid task action." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const expectedVersion = body.expectedVersion == null ? null : Number(body.expectedVersion);
    if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      return NextResponse.json({ error: "Invalid task version." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const submission = typeof body.submission === "string" ? body.submission : null;
    if (submission && submission.length > 4000) {
      return NextResponse.json({ error: "Submission is too long." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data, error: transitionError } = await supabase.rpc("transition_team_task", {
      p_actor_user_id: user.id,
      p_task_id: params.taskId,
      p_action: action,
      p_expected_version: expectedVersion,
      p_submission: submission
    });

    if (transitionError) {
      return NextResponse.json(
        { error: transitionError.message },
        { status: mapTaskErrorStatus(transitionError.code), headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to update team task." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function mapTaskErrorStatus(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  if (code === "40001") return 409;
  return 500;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
