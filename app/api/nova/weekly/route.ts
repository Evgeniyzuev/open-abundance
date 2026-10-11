import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import { streamAiText } from "@/lib/ai/providerGateway";
import { plainChatText } from "@/lib/ai/plainText";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  acceptWeeklyText,
  hasWeeklyActivity,
  previousWeekStart,
  weekEndExclusive,
  weeklyFacts,
  weeklyFallbackText,
  type WeeklyStats
} from "@/lib/novaWeekly";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/nova/weekly?locale=ru
 *
 * The person's summary of the last completed week (Monday to Sunday, UTC), written once and cached.
 * Only their own counts are used. A person with no activity that week gets `{ summary: null }` and
 * nothing is generated. A model failure falls back to a plain template, so this never fails the screen.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = supabase as any;
  const locale = request.nextUrl.searchParams.get("locale") === "en" ? "en" : "ru";
  const weekStart = previousWeekStart(Date.now());

  const { data: cached } = await db.from("nova_weekly_summaries").select("body,empty").eq("user_id", user.id).eq("week_start", weekStart).maybeSingle();
  if (cached) return json({ summary: cached.empty || !cached.body ? null : { weekStart, body: cached.body } });

  const stats = await loadWeeklyStats(db, user.id, weekStart);
  if (!hasWeeklyActivity(stats)) {
    await db.from("nova_weekly_summaries").upsert({ user_id: user.id, week_start: weekStart, empty: true, stats }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
    return json({ summary: null });
  }

  let body = weeklyFallbackText(stats, locale);
  let source: "model" | "template" = "template";
  try {
    const modelText = await writeWeeklyText(stats, locale);
    if (modelText) { body = modelText; source = "model"; }
  } catch {
    // The template is a complete answer.
  }
  await db.from("nova_weekly_summaries").upsert({ user_id: user.id, week_start: weekStart, body, source, stats }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
  return json({ summary: { weekStart, body } });
}

async function writeWeeklyText(stats: WeeklyStats, locale: "ru" | "en"): Promise<string | null> {
  const system = `${buildAiSystemPrompt({ locale, capability: "chat.general" })}

## Weekly summary
- Write one short plain paragraph of three or four sentences for the person about their last week, as Nova.
- Use only the facts given in the request. Do not invent numbers, events, feelings or promises. Never say Core can fall or promise income.
- Warm and specific, no lists, no Markdown, no emoji. End with one small, feasible step for the new week.`;
  const user = locale === "ru"
    ? `Facts about my last week:\n${weeklyFacts(stats).map((fact) => `- ${fact}`).join("\n")}\nWrite the summary in Russian.`
    : `Facts about my last week:\n${weeklyFacts(stats).map((fact) => `- ${fact}`).join("\n")}\nWrite the summary in English.`;
  const response = await streamAiText({ systemPrompt: system, messages: [{ role: "user", content: user }], maxOutputTokens: 400, temperature: 0.5 });
  return acceptWeeklyText(plainChatText(await response.text()));
}

async function loadWeeklyStats(db: any, userId: string, weekStart: string): Promise<WeeklyStats> {
  const weekEnd = weekEndExclusive(weekStart);
  const from = `${weekStart}T00:00:00Z`;
  const to = `${weekEnd}T00:00:00Z`;
  const [accruals, challenges, nova, posts, wishes, opens] = await Promise.all([
    db.from("daily_core_accruals").select("accrual_date,core_before,core_after,gross_amount").eq("user_id", userId).gte("accrual_date", weekStart).lt("accrual_date", weekEnd).order("accrual_date", { ascending: true }),
    db.from("user_challenges").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed").gte("updated_at", from).lt("updated_at", to),
    db.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("capability", "chat.general").eq("status", "accepted").gte("created_at", from).lt("created_at", to),
    db.from("feed_posts").select("id", { count: "exact", head: true }).eq("author_user_id", userId).is("source_key", null).is("repost_of_post_id", null).is("deleted_at", null).eq("status", "published").gte("published_at", from).lt("published_at", to),
    db.from("wishes").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).is("deleted_at", null).gte("created_at", from).lt("created_at", to),
    db.from("product_events").select("occurred_at").eq("user_id", userId).eq("event_name", "app_open").gte("occurred_at", from).lt("occurred_at", to).limit(2000)
  ]);
  const rows: Array<{ core_before: number | string; core_after: number | string; gross_amount: number | string }> = accruals.data ?? [];
  const days = new Set<string>((opens.data ?? []).map((row: { occurred_at: string }) => String(row.occurred_at).slice(0, 10)));
  return {
    weekStart,
    coreStart: rows.length ? Number(rows[0].core_before) : null,
    coreEnd: rows.length ? Number(rows[rows.length - 1].core_after) : null,
    accrued: rows.reduce((sum, row) => sum + (Number(row.gross_amount) || 0), 0),
    challengesCompleted: challenges.count ?? 0,
    novaMessages: nova.count ?? 0,
    postsPublished: posts.count ?? 0,
    wishesAdded: wishes.count ?? 0,
    activeDays: days.size
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
