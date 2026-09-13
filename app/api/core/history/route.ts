import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CoreHistoryKind = "daily_accrual" | "challenge_reward" | "peer_review_reward" | "wallet_core_topup" | "team_bonus";

export type CoreHistoryRow = {
  id: string;
  occurred_at: string;
  kind: CoreHistoryKind;
  amount: number;
  source_id: string;
  challenge_id?: string;
  challenge_title?: string;
  metadata?: Record<string, unknown>;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const [accruals, challenges, reviews, topups, teamBonuses] = await Promise.all([
      supabase
        .from("daily_core_accruals")
        .select("accrual_date,core_amount,created_at")
        .eq("user_id", user.id)
        .gt("core_amount", 0)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("user_challenges")
        .select("id,challenge_id,core_reward_amount,reward_settled_at,updated_at,status,challenges(title)")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gt("core_reward_amount", 0)
        .order("reward_settled_at", { ascending: false })
        .limit(limit),
      supabase
        .from("peer_review_answers")
        .select("id,core_reward_amount,settled_at,reward_status")
        .eq("reviewer_user_id", user.id)
        .eq("reward_status", "paid")
        .gt("core_reward_amount", 0)
        .order("settled_at", { ascending: false })
        .limit(limit),
      supabase
        .from("wallet_ledger")
        .select("id,amount,created_at,source_id,metadata")
        .eq("user_id", user.id)
        .eq("operation_type", "wallet_core_topup")
        .eq("direction", "debit")
        .gt("amount", 0)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("team_core_growth_rewards")
        .select("id,reward_amount,created_at,bonus_date,source_user_id,depth")
        .eq("leader_user_id", user.id)
        .gt("reward_amount", 0)
        .order("created_at", { ascending: false })
        .limit(limit)
    ]);

    const failed = [accruals, challenges, reviews, topups, teamBonuses].find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500, headers: NO_STORE_HEADERS });

    const rows: CoreHistoryRow[] = [
      ...((accruals.data ?? []) as Array<{ accrual_date: string; core_amount: number; created_at: string }>).map((row) => ({
        id: `daily:${row.accrual_date}`,
        occurred_at: row.created_at,
        kind: "daily_accrual" as const,
        amount: Number(row.core_amount),
        source_id: row.accrual_date
      })),
      ...((challenges.data ?? []) as Array<{ id: string; challenge_id: string; core_reward_amount: number; reward_settled_at: string | null; updated_at: string; challenges?: { title?: string } | Array<{ title?: string }> | null }>).map((row) => ({
        id: `challenge:${row.id}`,
        occurred_at: row.reward_settled_at ?? row.updated_at,
        kind: "challenge_reward" as const,
        amount: Number(row.core_reward_amount),
        source_id: row.id,
        challenge_id: row.challenge_id,
        challenge_title: Array.isArray(row.challenges) ? row.challenges[0]?.title : row.challenges?.title
      })),
      ...((reviews.data ?? []) as Array<{ id: string; core_reward_amount: number; settled_at: string | null; reward_status: string }>).map((row) => ({
        id: `peer-review:${row.id}`,
        occurred_at: row.settled_at ?? new Date(0).toISOString(),
        kind: "peer_review_reward" as const,
        amount: Number(row.core_reward_amount),
        source_id: row.id
      })),
      ...((topups.data ?? []) as Array<{ id: string; amount: number; created_at: string; source_id: string | null; metadata: Record<string, unknown> | null }>).map((row) => ({
        id: `topup:${row.id}`,
        occurred_at: row.created_at,
        kind: "wallet_core_topup" as const,
        amount: Number(row.amount),
        source_id: row.source_id ?? row.id,
        metadata: row.metadata ?? undefined
      })),
      ...((teamBonuses.data ?? []) as Array<{ id: string; reward_amount: number; created_at: string; bonus_date: string; source_user_id: string; depth: number }>).map((row) => ({
        id: `team:${row.id}`,
        occurred_at: row.created_at,
        kind: "team_bonus" as const,
        amount: Number(row.reward_amount),
        source_id: row.id,
        metadata: { bonus_date: row.bonus_date, source_user_id: row.source_user_id, depth: row.depth }
      }))
    ]
      .filter((row) => Number.isFinite(row.amount) && row.amount > 0)
      .sort((left, right) => safeTimestamp(right.occurred_at) - safeTimestamp(left.occurred_at))
      .slice(0, limit);

    return NextResponse.json({ rows }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load Core history." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(90, Math.floor(parsed)));
}

function safeTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
