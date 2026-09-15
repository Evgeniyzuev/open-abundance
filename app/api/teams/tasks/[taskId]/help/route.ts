import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const HELP_REASONS = new Set(["blocked", "clarification", "feedback", "other"]);

type HelpRequestBody = {
  action?: string;
  helpRequestId?: string;
  reason?: string;
  comment?: string;
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

    const body = (await request.json().catch(() => ({}))) as HelpRequestBody;
    if (body.action === "resolve") {
      if (!body.helpRequestId || !isUuid(body.helpRequestId)) {
        return NextResponse.json({ error: "Invalid help request." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      const { data, error: resolveError } = await supabase.rpc("resolve_team_task_help", {
        p_actor_user_id: user.id,
        p_help_request_id: body.helpRequestId
      });
      if (resolveError) {
        return NextResponse.json({ error: resolveError.message }, { status: mapErrorStatus(resolveError.code), headers: NO_STORE_HEADERS });
      }
      return NextResponse.json(data, { headers: NO_STORE_HEADERS });
    }

    const reason = body.reason?.trim() ?? "";
    const comment = body.comment?.trim() ?? "";
    if (!HELP_REASONS.has(reason)) {
      return NextResponse.json({ error: "Invalid help reason." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (comment.length > 2000) {
      return NextResponse.json({ error: "Help comment is too long." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { data, error: helpError } = await supabase.rpc("request_team_task_help", {
      p_actor_user_id: user.id,
      p_task_id: params.taskId,
      p_reason: reason,
      p_comment: comment
    });
    if (helpError) {
      return NextResponse.json({ error: helpError.message }, { status: mapErrorStatus(helpError.code), headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(data, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to update task help." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

function mapErrorStatus(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "22023" || code === "23514") return 400;
  if (code === "23505" || code === "40001") return 409;
  return 500;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
