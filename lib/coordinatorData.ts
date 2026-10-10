import type { ParticipantRecord } from "@/lib/coordinatorAnalysis";

type AnyDb = { from: (table: string) => any };

const DAY_MS = 86_400_000;
const EVENT_WINDOW_DAYS = 45;
const EVENT_ROW_LIMIT = 20_000;

/**
 * Builds one record per participant from tables that already exist. It adds no tracking of its
 * own: behaviour comes from product_events plus the wish, feed, challenge, referral, AI-usage and
 * economy tables. Only counts and flags leave this function, never text.
 *
 * Reads are bounded: events are limited to a recent window and a row cap, which is ample for a
 * pilot. Move to a daily snapshot table before the group grows past a few hundred people.
 */
export async function loadParticipantRecords(db: AnyDb, now = Date.now()): Promise<{ participants: ParticipantRecord[]; truncated: boolean }> {
  const since = new Date(now - EVENT_WINDOW_DAYS * DAY_MS).toISOString();

  const [profiles, cores, wishes, posts, ai, challenges, feedback, referrals, economy, helpProfiles, events] = await Promise.all([
    db.from("user_profiles").select("user_id,created_at"),
    db.from("core_accounts").select("user_id,balance"),
    db.from("wishes").select("owner_user_id").is("deleted_at", null),
    db.from("feed_posts").select("author_user_id").is("source_key", null).is("repost_of_post_id", null).is("deleted_at", null).eq("status", "published").not("author_user_id", "is", null),
    db.from("ai_usage_events").select("user_id").eq("capability", "chat.general").eq("status", "accepted"),
    db.from("user_challenges").select("user_id,status"),
    db.from("challenge_feedback_submissions").select("user_id").eq("status", "submitted"),
    db.from("referral_edges").select("referrer_user_id"),
    db.from("user_economy_metrics")
      .select("user_id,core_growth_challenge_rewards,core_growth_leader_bonus,core_growth_reinvest,core_growth_wallet_topups,core_growth_other_system")
      .eq("period_type", "lifetime"),
    db.from("user_help_profiles").select("user_id,offers,needs,match_consent"),
    db.from("product_events")
      .select("user_id,event_name,occurred_at,properties")
      .in("event_name", [
        "app_open",
        "feed_post_impression",
        "core_calculator_mode_selected",
        "feed_post_shared_external",
        "wish_outcome_answered",
        "self_serve_checkin_answered"
      ])
      .not("user_id", "is", null)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(EVENT_ROW_LIMIT)
  ]);

  const failed = [profiles, cores, wishes, posts, ai, challenges, feedback, referrals, economy, helpProfiles, events].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const count = (rows: Array<Record<string, any>> | null, key: string) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row[key];
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };

  const wishCounts = count(wishes.data, "owner_user_id");
  const postCounts = count(posts.data, "author_user_id");
  const aiCounts = count(ai.data, "user_id");
  const feedbackCounts = count(feedback.data, "user_id");
  const referralCounts = count(referrals.data, "referrer_user_id");
  const acceptedCounts = count((challenges.data ?? []).filter((row: any) => row.status === "accepted" || row.status === "completed"), "user_id");
  const completedCounts = count((challenges.data ?? []).filter((row: any) => row.status === "completed"), "user_id");
  const balances = new Map<string, number>((cores.data ?? []).map((row: any) => [row.user_id, Number(row.balance) || 0]));

  const growth = new Map<string, ParticipantRecord["coreGrowth"]>();
  for (const row of economy.data ?? []) {
    const current = growth.get(row.user_id) ?? { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 };
    current.challengeRewards += Number(row.core_growth_challenge_rewards) || 0;
    current.leaderBonus += Number(row.core_growth_leader_bonus) || 0;
    current.reinvest += Number(row.core_growth_reinvest) || 0;
    current.walletTopups += Number(row.core_growth_wallet_topups) || 0;
    current.otherSystem += Number(row.core_growth_other_system) || 0;
    growth.set(row.user_id, current);
  }

  const help = new Map<string, ParticipantRecord["helpProfile"]>(
    (helpProfiles.data ?? []).map((row: any) => [row.user_id, { offers: row.offers ?? [], needs: row.needs ?? [], consent: Boolean(row.match_consent) }])
  );

  type EventAggregate = {
    stories: Set<string>;
    calculator: boolean;
    shares: number;
    outcomes: string[];
    checkin: string | null;
    activeDates: Set<string>;
  };
  const byUser = new Map<string, EventAggregate>();
  const aggregate = (userId: string) => {
    let value = byUser.get(userId);
    if (!value) {
      value = { stories: new Set(), calculator: false, shares: 0, outcomes: [], checkin: null, activeDates: new Set() };
      byUser.set(userId, value);
    }
    return value;
  };
  for (const event of events.data ?? []) {
    const entry = aggregate(event.user_id);
    const props = event.properties && typeof event.properties === "object" ? event.properties : {};
    if (event.event_name === "app_open") entry.activeDates.add(String(event.occurred_at).slice(0, 10));
    else if (event.event_name === "feed_post_impression") entry.stories.add(String(props.post_id ?? event.occurred_at));
    else if (event.event_name === "core_calculator_mode_selected") entry.calculator = true;
    else if (event.event_name === "feed_post_shared_external") entry.shares += 1;
    else if (event.event_name === "wish_outcome_answered" && typeof props.answer === "string") entry.outcomes.push(props.answer);
    else if (event.event_name === "self_serve_checkin_answered" && !entry.checkin && typeof props.answer === "string") entry.checkin = props.answer;
  }

  const participants = (profiles.data ?? []).map((profile: any): ParticipantRecord => {
    const id: string = profile.user_id;
    const registeredMs = Date.parse(profile.created_at);
    const registeredDate = new Date(registeredMs).toISOString().slice(0, 10);
    const activity = byUser.get(id);
    const tooNew = now - registeredMs < 2 * DAY_MS;
    const returnedDay2 = tooNew
      ? null
      : Array.from(activity?.activeDates ?? []).some((date) => date > registeredDate && Date.parse(date) - Date.parse(registeredDate) <= 3 * DAY_MS);

    return {
      id,
      registeredAt: profile.created_at,
      coreBalance: balances.get(id) ?? 0,
      coreGrowth: growth.get(id) ?? { challengeRewards: 0, leaderBonus: 0, reinvest: 0, walletTopups: 0, otherSystem: 0 },
      storiesViewed: activity?.stories.size ?? 0,
      wishes: wishCounts.get(id) ?? 0,
      calculatorUsed: activity?.calculator ?? false,
      challengesAccepted: acceptedCounts.get(id) ?? 0,
      challengesCompleted: completedCounts.get(id) ?? 0,
      feedbackSubmitted: feedbackCounts.get(id) ?? 0,
      novaMessages: aiCounts.get(id) ?? 0,
      returnedDay2,
      contentPosts: postCounts.get(id) ?? 0,
      externalShares: activity?.shares ?? 0,
      referralsInvited: referralCounts.get(id) ?? 0,
      helpProfile: help.get(id) ?? null,
      outcomeAnswers: activity?.outcomes ?? [],
      checkinAnswer: activity?.checkin ?? null
    };
  });

  return { participants, truncated: (events.data ?? []).length >= EVENT_ROW_LIMIT };
}
