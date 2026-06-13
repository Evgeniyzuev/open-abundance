import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/lib/database.types";

type ServerSupabase = SupabaseClient<Database>;
type CoreGrowthPlan = Tables<"user_core_growth_plans">;
type TodayInstance = Tables<"user_today_instances">;
type TodayItem = Tables<"user_today_items">;
type TodayProgressEvent = Tables<"today_progress_events">;

type RawChallengeCompletion = {
  challenge_id: string;
  challenges: { reward_label: Json } | { reward_label: Json }[] | null;
  id: string;
  updated_at: string;
};

type TodaySyncOptions = {
  complete?: boolean;
  markIntroSeen?: boolean;
  timezone?: string | null;
};

export type TodayPayload = {
  checkInStreak: number;
  completionStreak: number;
  items: TodayItem[];
  plan: CoreGrowthPlan | null;
  progressEvents: TodayProgressEvent[];
  setupRequired: boolean;
  showIntro: boolean;
  today: TodayInstance;
};

const DEFAULT_TODAY_TARGET = 1;

export async function syncTodayForUser(
  supabase: ServerSupabase,
  userId: string,
  options: TodaySyncOptions = {}
): Promise<TodayPayload> {
  const timezone = await resolveTimezone(supabase, userId, options.timezone);
  const localDate = getLocalDate(new Date(), timezone);
  const [plan, existingToday] = await Promise.all([
    getActiveCoreGrowthPlan(supabase, userId),
    getTodayInstance(supabase, userId, localDate)
  ]);

  let today = existingToday ?? await createTodayInstance(supabase, {
    localDate,
    plan,
    timezone,
    userId
  });

  const showIntro = !today.info_seen_at;
  if (showIntro && options.markIntroSeen) {
    const { data, error } = await supabase
      .from("user_today_instances")
      .update({ info_seen_at: new Date().toISOString() })
      .eq("id", today.id)
      .select("*")
      .single();

    if (error) throw error;
    today = data;
  }

  await syncProgressEvents(supabase, userId, today.id, localDate, timezone);
  const progressEvents = await getProgressEvents(supabase, today.id);
  const progressCore = sumAmounts(progressEvents);
  const shouldComplete = today.status !== "completed" && options.complete && progressCore >= Number(today.target_core);
  const nextStatus = shouldComplete ? "completed" : today.status;
  const completedAt = shouldComplete ? new Date().toISOString() : today.completed_at;

  const { data: updatedToday, error: updateError } = await supabase
    .from("user_today_instances")
    .update({
      completed_at: completedAt,
      progress_core: progressCore,
      status: nextStatus
    })
    .eq("id", today.id)
    .select("*")
    .single();

  if (updateError) throw updateError;
  today = updatedToday;

  await upsertTodayItems(supabase, today, plan, progressEvents);
  const [items, streaks] = await Promise.all([
    getTodayItems(supabase, today.id),
    getTodayStreaks(supabase, userId, localDate)
  ]);

  return {
    checkInStreak: streaks.checkInStreak,
    completionStreak: streaks.completionStreak,
    items,
    plan,
    progressEvents,
    setupRequired: !plan,
    showIntro,
    today
  };
}

async function resolveTimezone(supabase: ServerSupabase, userId: string, preferredTimezone?: string | null): Promise<string> {
  if (preferredTimezone && isValidTimezone(preferredTimezone)) return preferredTimezone;

  const { data } = await supabase
    .from("user_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.timezone && isValidTimezone(data.timezone)) return data.timezone;
  return "UTC";
}

async function getActiveCoreGrowthPlan(supabase: ServerSupabase, userId: string): Promise<CoreGrowthPlan | null> {
  const { data, error } = await supabase
    .from("user_core_growth_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function getTodayInstance(supabase: ServerSupabase, userId: string, localDate: string): Promise<TodayInstance | null> {
  const { data, error } = await supabase
    .from("user_today_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function createTodayInstance(
  supabase: ServerSupabase,
  input: {
    localDate: string;
    plan: CoreGrowthPlan | null;
    timezone: string;
    userId: string;
  }
): Promise<TodayInstance> {
  const targetCore = Math.max(DEFAULT_TODAY_TARGET, Number(input.plan?.daily_additions ?? 0));
  const { data, error } = await supabase
    .from("user_today_instances")
    .insert({
      core_growth_plan_id: input.plan?.id ?? null,
      local_date: input.localDate,
      status: "accepted",
      target_core: targetCore,
      timezone: input.timezone,
      user_id: input.userId
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function syncProgressEvents(
  supabase: ServerSupabase,
  userId: string,
  todayInstanceId: string,
  localDate: string,
  timezone: string
): Promise<void> {
  const { startUtc, endUtc } = getUtcBoundsForLocalDate(localDate, timezone);
  const [topups, challengeRewards] = await Promise.all([
    getWalletCoreTopups(supabase, userId, startUtc, endUtc),
    getChallengeRewards(supabase, userId, startUtc, endUtc)
  ]);
  const rows = [
    ...topups.map((row) => ({
      amount_core: Number(row.amount),
      source_id: row.id,
      source_type: "wallet_core_topup",
      today_instance_id: todayInstanceId
    })),
    ...challengeRewards.map((row) => ({
      amount_core: rewardAmount(getChallengeRewardLabel(row)),
      source_id: row.id,
      source_type: "challenge_reward",
      today_instance_id: todayInstanceId
    }))
  ].filter((row) => row.amount_core > 0);

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("today_progress_events")
    .upsert(rows, { onConflict: "today_instance_id,source_type,source_id" });

  if (error) throw error;
}

async function getWalletCoreTopups(
  supabase: ServerSupabase,
  userId: string,
  startUtc: string,
  endUtc: string
): Promise<Array<{ amount: number; id: string }>> {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("id,amount")
    .eq("user_id", userId)
    .eq("operation_type", "wallet_core_topup")
    .eq("source_type", "core_topup")
    .eq("direction", "debit")
    .gte("created_at", startUtc)
    .lt("created_at", endUtc)
    .gt("amount", 0);

  if (error) throw error;
  return data ?? [];
}

async function getChallengeRewards(
  supabase: ServerSupabase,
  userId: string,
  startUtc: string,
  endUtc: string
): Promise<RawChallengeCompletion[]> {
  const { data, error } = await supabase
    .from("user_challenges")
    .select("id,challenge_id,updated_at,challenges(reward_label)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("updated_at", startUtc)
    .lt("updated_at", endUtc);

  if (error) throw error;
  return (data ?? []) as RawChallengeCompletion[];
}

async function getProgressEvents(supabase: ServerSupabase, todayInstanceId: string): Promise<TodayProgressEvent[]> {
  const { data, error } = await supabase
    .from("today_progress_events")
    .select("*")
    .eq("today_instance_id", todayInstanceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function upsertTodayItems(
  supabase: ServerSupabase,
  today: TodayInstance,
  plan: CoreGrowthPlan | null,
  progressEvents: TodayProgressEvent[]
): Promise<void> {
  const progressCore = sumAmounts(progressEvents);
  const hasChallengeReward = progressEvents.some((event) => event.source_type === "challenge_reward");
  const coreTargetReached = progressCore >= Number(today.target_core);
  const now = new Date().toISOString();
  const rows = [
    {
      completed_at: today.first_seen_at,
      item_key: "check_in",
      sort_order: 10,
      source_type: "system",
      status: "done",
      title: { en: "Check in", ru: "Зайти в систему" },
      today_instance_id: today.id
    },
    {
      completed_at: plan ? plan.updated_at : null,
      item_key: "core_growth_plan",
      sort_order: 20,
      source_type: "wallet",
      status: plan ? "done" : "pending",
      title: { en: "Save a Core growth plan", ru: "Сохранить план роста Core" },
      today_instance_id: today.id
    },
    {
      completed_at: coreTargetReached ? today.completed_at ?? now : null,
      item_key: "core_target",
      sort_order: 30,
      source_type: "wallet",
      status: coreTargetReached ? "done" : "pending",
      title: { en: "Reach today's Core target", ru: "Добрать дневную цель Core" },
      today_instance_id: today.id
    },
    {
      completed_at: hasChallengeReward ? now : null,
      item_key: "challenge_progress",
      sort_order: 40,
      source_type: "challenge",
      status: hasChallengeReward ? "done" : "pending",
      title: { en: "Complete one challenge", ru: "Завершить один челлендж" },
      today_instance_id: today.id
    }
  ];

  const { error } = await supabase
    .from("user_today_items")
    .upsert(rows, { onConflict: "today_instance_id,item_key" });

  if (error) throw error;
}

async function getTodayItems(supabase: ServerSupabase, todayInstanceId: string): Promise<TodayItem[]> {
  const { data, error } = await supabase
    .from("user_today_items")
    .select("*")
    .eq("today_instance_id", todayInstanceId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getTodayStreaks(
  supabase: ServerSupabase,
  userId: string,
  localDate: string
): Promise<{ checkInStreak: number; completionStreak: number }> {
  const { data, error } = await supabase
    .from("user_today_instances")
    .select("local_date,status")
    .eq("user_id", userId)
    .lte("local_date", localDate)
    .order("local_date", { ascending: false })
    .limit(90);

  if (error) throw error;

  const dates = new Set((data ?? []).map((row) => row.local_date));
  const completedDates = new Set((data ?? []).filter((row) => row.status === "completed").map((row) => row.local_date));
  return {
    checkInStreak: countConsecutiveDays(localDate, dates),
    completionStreak: countConsecutiveDays(localDate, completedDates)
  };
}

function countConsecutiveDays(localDate: string, dates: Set<string>): number {
  let count = 0;
  let cursor = parseLocalDate(localDate);

  while (dates.has(formatDate(cursor))) {
    count += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() - 1));
  }

  return count;
}

function sumAmounts(events: TodayProgressEvent[]): number {
  return events.reduce((sum, event) => sum + Number(event.amount_core), 0);
}

function getChallengeRewardLabel(row: RawChallengeCompletion): Json {
  const challenge = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
  return challenge?.reward_label ?? "1$";
}

function rewardAmount(value: Json): number {
  const raw = rewardLabelText(value);
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function rewardLabelText(value: Json): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, Json | undefined>;
    const en = record.en;
    const ru = record.ru;
    if (typeof en === "string") return en;
    if (typeof ru === "string") return ru;
  }

  return "1$";
}

function getLocalDate(date: Date, timezone: string): string {
  const parts = getTimeParts(date, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getUtcBoundsForLocalDate(localDate: string, timezone: string): { endUtc: string; startUtc: string } {
  const [year, month, day] = localDate.split("-").map(Number);
  const start = zonedTimeToUtc(year, month, day, 0, 0, 0, timezone);
  const end = zonedTimeToUtc(year, month, day + 1, 0, 0, 0, timezone);
  return {
    endUtc: end.toISOString(),
    startUtc: start.toISOString()
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timezone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimezoneOffsetMs(utcGuess, timezone);
  const firstPass = new Date(utcGuess.getTime() - offset);
  const secondOffset = getTimezoneOffsetMs(firstPass, timezone);
  return new Date(utcGuess.getTime() - secondOffset);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const parts = getTimeParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function getTimeParts(date: Date, timezone: string): { day: number; hour: number; minute: number; month: number; second: number; year: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year)
  };
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
