import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const CHANGE_KEYS = new Set(["title", "description", "goalContext", "expectedResult", "firstStep", "estimatedMinutes", "verificationCriteria", "dueAt", "leaderReviewDueAt"]);

type RevisionBody = { changes?: Record<string, unknown> };

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    if (!isUuid(params.taskId)) {
      return NextResponse.json({ error: "Invalid task id." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const body = (await request.json().catch(() => ({}))) as RevisionBody;
    const source = body.changes && typeof body.changes === "object" ? body.changes : null;
    if (!source) {
      return NextResponse.json({ error: "Change object is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!CHANGE_KEYS.has(key)) continue;
      if (typeof value === "string") {
        if (value.trim().length > 4000) return NextResponse.json({ error: "A change is too long." }, { status: 400, headers: NO_STORE_HEADERS });
        changes[key] = value.trim();
      } else if (typeof value === "number" && Number.isInteger(value)) {
        changes[key] = value;
      }
    }
    if (!Object.keys(changes).length) {
      return NextResponse.json({ error: "At least one supported change is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if ("estimatedMinutes" in changes && (Number(changes.estimatedMinutes) < 1 || Number(changes.estimatedMinutes) > 1440)) {
      return NextResponse.json({ error: "Invalid estimated duration." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    for (const key of ["dueAt", "leaderReviewDueAt"]) {
      if (key in changes) {
        if (changes[key] === "") continue;
        const parsed = new Date(String(changes[key]));
        if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid change date." }, { status: 400, headers: NO_STORE_HEADERS });
        changes[key] = parsed.toISOString();
      }
    }

    const { data, error: revisionError } = await supabase.rpc("propose_team_task_revision", {
      p_actor_user_id: user.id,
      p_task_id: params.taskId,
      p_changes: changes as Json
    });
    if (revisionError) {
      return NextResponse.json({ error: revisionError.message }, { status: mapErrorStatus(revisionError.code), headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(data, { status: 201, headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json({ error: routeError instanceof Error ? routeError.message : "Failed to propose task changes." }, { status: 500, headers: NO_STORE_HEADERS });
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
