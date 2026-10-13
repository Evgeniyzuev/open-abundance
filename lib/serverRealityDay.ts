import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert } from "@/lib/database.types";
import {
  parseRealityDaySummary,
  realityDayHasActivity,
  realityWinsCount,
  utcDateKey,
  type RealityDaySummary
} from "@/lib/realityDay";

type Db = SupabaseClient<Database>;
type DailyCoreAccrual = Pick<
  Tables<"daily_core_accruals">,
  "accrual_date" | "core_before" | "daily_rate" | "gross_amount" | "reinvest_percent" | "core_amount" | "wallet_amount" | "core_after" | "created_at"
>;
type FeedPostRow = Tables<"feed_posts">;
type FeedStatBlockRow = Tables<"feed_post_stat_blocks">;

export type RealityDayContext = {
  date: string;
  accrual: DailyCoreAccrual | null;
  summary: RealityDaySummary;
  levelBefore: number;
  levelAfter: number;
  teamBonusAmount: number;
  teamStrength: number;
  teamMemberCount: number;
};

export type RealityDayDraft = {
  post: FeedPostRow & { statBlocks: FeedStatBlockRow[] };
  summary: RealityDaySummary;
};

/** Loads everything the day post needs. Reads only; nothing is written. */
export async function loadRealityDayContext(supabase: Db, userId: string, requestedDate: string | null): Promise<RealityDayContext> {
  const date = requestedDate ?? utcDateKey();
  const [accrualResult, summaryResult, coreResult, teamBonusAmount, team] = await Promise.all([
    supabase
      .from("daily_core_accruals")
      .select("accrual_date,core_before,daily_rate,gross_amount,reinvest_percent,core_amount,wallet_amount,core_after,created_at")
      .eq("user_id", userId)
      .eq("accrual_date", date)
      .maybeSingle(),
    supabase.rpc("reality_day_summary", { p_user_id: userId, p_date: date }),
    supabase.from("core_accounts").select("level").eq("user_id", userId).maybeSingle(),
    loadTeamBonusAmount(supabase, userId, date),
    loadTeamStrength(supabase, userId)
  ]);
  if (accrualResult.error) throw accrualResult.error;
  if (summaryResult.error) throw summaryResult.error;
  if (coreResult.error) throw coreResult.error;

  const accrual = (accrualResult.data ?? null) as DailyCoreAccrual | null;
  let levelBefore = Number(coreResult.data?.level ?? 0);
  let levelAfter = levelBefore;
  if (accrual) {
    [levelBefore, levelAfter] = await Promise.all([
      calculateCoreLevel(supabase, Number(accrual.core_before)),
      calculateCoreLevel(supabase, Number(accrual.core_after) + teamBonusAmount)
    ]);
  }

  return {
    date,
    accrual,
    summary: parseRealityDaySummary(summaryResult.data, date),
    levelBefore,
    levelAfter,
    teamBonusAmount,
    teamStrength: team.levelSum,
    teamMemberCount: team.memberCount
  };
}

export function realityDayHasContent(context: RealityDayContext): boolean {
  return Boolean(context.accrual) || realityDayHasActivity(context.summary);
}

/**
 * Creates or refreshes the single day post (one snapshot and one post per user and UTC date).
 * Block visibility chosen by the author is kept; new blocks start public.
 */
export async function upsertRealityDayDraft(supabase: Db, userId: string, context: RealityDayContext): Promise<RealityDayDraft> {
  const snapshot = await upsertSnapshot();
  const post = await getOrCreatePost(snapshot.id);
  const statBlocks = await syncStatBlocks(post, snapshot.id);
  await syncDefaultCover(post);
  return { post: { ...post, statBlocks }, summary: context.summary };

  async function upsertSnapshot(): Promise<Tables<"progress_snapshots">> {
    const row = context.accrual;
    const { data, error } = await supabase
      .from("progress_snapshots")
      .upsert(
        {
          user_id: userId,
          source_type: "daily_core_accrual",
          source_date: context.date,
          core_before: row?.core_before ?? null,
          daily_rate: row?.daily_rate ?? null,
          gross_amount: row?.gross_amount ?? null,
          reinvest_percent: row?.reinvest_percent ?? null,
          core_amount: row?.core_amount ?? null,
          wallet_amount: row?.wallet_amount ?? null,
          core_after: row?.core_after ?? null,
          payload: buildSnapshotPayload(context)
        },
        { onConflict: "user_id,source_type,source_date" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async function getOrCreatePost(snapshotId: string): Promise<FeedPostRow> {
    const eventType = context.levelAfter > context.levelBefore ? "level_up" : "daily_progress";
    const { data: existingPost, error: existingError } = await supabase
      .from("feed_posts")
      .select("*")
      .eq("author_user_id", userId)
      .eq("snapshot_id", snapshotId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingPost) {
      const nextBody = shouldRefreshDefaultBody(existingPost.body) ? buildDefaultBody(context.date) : existingPost.body;
      if (existingPost.post_type === eventType && nextBody === existingPost.body) return existingPost;
      const { data, error } = await supabase
        .from("feed_posts")
        .update({ post_type: eventType, body: nextBody })
        .eq("id", existingPost.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from("feed_posts")
      .insert({
        author_user_id: userId,
        snapshot_id: snapshotId,
        post_type: eventType,
        status: "draft",
        visibility: "public",
        body: buildDefaultBody(context.date)
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async function syncStatBlocks(post: FeedPostRow, snapshotId: string): Promise<FeedStatBlockRow[]> {
    const { data: existingBlocks, error: existingError } = await supabase
      .from("feed_post_stat_blocks")
      .select("*")
      .eq("post_id", post.id);
    if (existingError) throw existingError;

    const visibilityByKey = new Map((existingBlocks ?? []).map((block) => [block.block_key, block.visibility]));
    const blocks = buildRealityStatBlocks(post.id, snapshotId, context).map((block) => ({
      ...block,
      visibility: visibilityByKey.get(block.block_key) ?? block.visibility
    }));
    const desiredKeys = new Set(blocks.map((block) => block.block_key));
    const obsoleteIds = (existingBlocks ?? []).filter((block) => !desiredKeys.has(block.block_key)).map((block) => block.id);
    if (obsoleteIds.length) {
      const { error } = await supabase.from("feed_post_stat_blocks").delete().in("id", obsoleteIds);
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from("feed_post_stat_blocks")
      .upsert(blocks, { onConflict: "post_id,block_key" })
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async function syncDefaultCover(post: FeedPostRow): Promise<void> {
    const { count, error: countError } = await supabase
      .from("feed_post_media")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id);
    if (countError) throw countError;
    if (count) return;
    const template = post.post_type === "level_up" ? "level-up" : "daily-progress";
    const { error } = await supabase.from("feed_post_media").insert({
      post_id: post.id,
      media_type: "image",
      media_url: `/feed/system-events/${template}.png`,
      alt_text: {},
      sort_order: 0,
      metadata: { origin: "system_template", templateKey: post.post_type }
    } satisfies TablesInsert<"feed_post_media">);
    if (error) throw error;
  }
}

export function buildRealityStatBlocks(postId: string, snapshotId: string, context: RealityDayContext): Array<TablesInsert<"feed_post_stat_blocks">> {
  const { summary } = context;
  const coreInterestAmount = Number(context.accrual?.core_amount ?? 0);
  const blocks: Array<Omit<TablesInsert<"feed_post_stat_blocks">, "post_id" | "snapshot_id" | "sort_order">> = [
    {
      block_key: "level",
      label: "LVL",
      value: { levelBefore: context.levelBefore, levelAfter: context.levelAfter, leveledUp: context.levelAfter > context.levelBefore } as Json,
      visibility: "public"
    },
    { block_key: "turnover", label: "Turnover", value: { amount: summary.turnover.total, ...summary.turnover } as Json, visibility: "public" },
    { block_key: "spent", label: "Spent", value: { amount: summary.spent.total, ...summary.spent } as Json, visibility: "public" },
    {
      block_key: "wins",
      label: "Wins",
      value: { count: realityWinsCount(summary), challenges: summary.wins.challenges, wishes: summary.wins.wishes } as Json,
      visibility: "public"
    },
    {
      block_key: "total_core_growth",
      label: "Total Core Growth",
      value: { amount: coreInterestAmount + context.teamBonusAmount, coreInterestAmount, teamBonusAmount: context.teamBonusAmount } as Json,
      visibility: "public"
    },
    {
      block_key: "team_strength",
      label: "Team Strength",
      value: { levelSum: context.teamStrength, memberCount: context.teamMemberCount } as Json,
      visibility: "public"
    }
  ];
  return blocks.map((block, index) => ({ ...block, post_id: postId, snapshot_id: snapshotId, sort_order: index }));
}

function buildSnapshotPayload(context: RealityDayContext): Json {
  return {
    source: context.accrual ? "daily_core_accruals" : "reality_day",
    accrualDate: context.date,
    sourceCreatedAt: context.accrual?.created_at ?? null,
    teamBonusAmount: context.teamBonusAmount,
    levelBefore: context.levelBefore,
    levelAfter: context.levelAfter,
    teamStrength: context.teamStrength,
    teamMemberCount: context.teamMemberCount,
    summary: context.summary as unknown as Json
  };
}

function buildDefaultBody(date: string): string {
  return `My Growth: ${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}`;
}

function shouldRefreshDefaultBody(value: string | null): boolean {
  return !value || value.startsWith("Daily Core progress for ");
}

async function loadTeamBonusAmount(supabase: Db, userId: string, date: string): Promise<number> {
  const { data, error } = await supabase
    .from("team_core_growth_rewards")
    .select("reward_amount")
    .eq("leader_user_id", userId)
    .eq("bonus_date", date);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.reward_amount), 0);
}

async function loadTeamStrength(supabase: Db, userId: string): Promise<{ levelSum: number; memberCount: number }> {
  const { data: memberships, error } = await supabase
    .from("team_memberships")
    .select("member_user_id")
    .eq("leader_user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  const memberIds = (memberships ?? []).map((membership) => membership.member_user_id);
  if (!memberIds.length) return { levelSum: 0, memberCount: 0 };
  const { data: profiles, error: profilesError } = await supabase.from("user_profiles").select("level").in("user_id", memberIds);
  if (profilesError) throw profilesError;
  return {
    levelSum: (profiles ?? []).reduce((sum, profile) => sum + Number(profile.level ?? 0), 0),
    memberCount: memberIds.length
  };
}

async function calculateCoreLevel(supabase: Db, balance: number): Promise<number> {
  const { data, error } = await supabase.rpc("calculate_core_level", { core_balance: balance });
  if (error) throw error;
  return Number(data ?? 0);
}
