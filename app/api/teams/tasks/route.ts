import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const TASK_KINDS = new Set(["manual", "challenge"]);

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 100) || 100, 1), 100);
    const { data, error: tasksError } = await supabase
      .from("team_tasks")
      .select("*")
      .or(`leader_user_id.eq.${user.id},member_user_id.eq.${user.id}`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const tasks = data ?? [];
    const taskIds = tasks.map((task) => task.id);
    const [helpResult, revisionResult] = taskIds.length ? await Promise.all([
      supabase.from("team_task_help_requests").select("*").in("task_id", taskIds).order("created_at", { ascending: false }),
      supabase.from("team_task_revisions").select("*").in("task_id", taskIds).order("created_at", { ascending: false })
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (helpResult.error && !isMissingCollaborationSchema(helpResult.error)) {
      return NextResponse.json({ error: helpResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (revisionResult.error && !isMissingCollaborationSchema(revisionResult.error)) {
      return NextResponse.json({ error: revisionResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        ...task,
        help_requests: (helpResult.error ? [] : helpResult.data ?? []).filter((help) => help.task_id === task.id),
        revisions: (revisionResult.error ? [] : revisionResult.data ?? []).filter((revision) => revision.task_id === task.id)
      }))
    }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load team tasks." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

type CreateTaskRequest = {
  memberUserId?: string;
  taskKind?: string;
  title?: string;
  description?: string;
  goalContext?: string;
  expectedResult?: string;
  firstStep?: string;
  estimatedMinutes?: number | string | null;
  verificationCriteria?: string;
  dueAt?: string | null;
  leaderReviewDueAt?: string | null;
  challengeId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as CreateTaskRequest;
    const memberUserId = body.memberUserId?.trim();
    const taskKind = body.taskKind?.trim() || "manual";
    const title = body.title?.trim() ?? "";
    const description = body.description?.trim() ?? "";
    const goalContext = body.goalContext?.trim() ?? "";
    const expectedResult = body.expectedResult?.trim() ?? "";
    const firstStep = body.firstStep?.trim() ?? "";
    const verificationCriteria = body.verificationCriteria?.trim() ?? "";
    const challengeId = body.challengeId?.trim() || null;

    if (!memberUserId || !isUuid(memberUserId)) {
      return NextResponse.json({ error: "Invalid member." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (!TASK_KINDS.has(taskKind)) {
      return NextResponse.json({ error: "Invalid task kind." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (title.length < 1 || title.length > 160 || description.length > 4000 || goalContext.length > 1200 || expectedResult.length > 2000 || firstStep.length > 1200 || verificationCriteria.length > 2000) {
      return NextResponse.json({ error: "Task title or description is invalid." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const estimatedMinutes = body.estimatedMinutes == null || body.estimatedMinutes === "" ? null : Number(body.estimatedMinutes);
    if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) {
      return NextResponse.json({ error: "Invalid estimated duration." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (taskKind === "challenge" && (!challengeId || !isUuid(challengeId))) {
      return NextResponse.json({ error: "Choose a valid challenge." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (taskKind === "manual" && challengeId) {
      return NextResponse.json({ error: "Manual tasks cannot reference a challenge." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    let dueAt: string | null = null;
    if (body.dueAt) {
      const parsed = new Date(body.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid due date." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      dueAt = parsed.toISOString();
    }
    let leaderReviewDueAt: string | null = null;
    if (body.leaderReviewDueAt) {
      const parsed = new Date(body.leaderReviewDueAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid review date." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      leaderReviewDueAt = parsed.toISOString();
    }

    const { data, error: createError } = await supabase.rpc("create_team_task", {
      p_actor_user_id: user.id,
      p_member_user_id: memberUserId,
      p_task_kind: taskKind,
      p_title: title,
      p_description: description,
      p_goal_context: goalContext || null,
      p_expected_result: expectedResult || null,
      p_first_step: firstStep || null,
      p_estimated_minutes: estimatedMinutes,
      p_verification_criteria: verificationCriteria || null,
      p_due_at: dueAt,
      p_leader_review_due_at: leaderReviewDueAt,
      p_challenge_id: challengeId
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: mapTaskErrorStatus(createError.code), headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ task: data }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to create team task." },
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

function isMissingCollaborationSchema(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}
