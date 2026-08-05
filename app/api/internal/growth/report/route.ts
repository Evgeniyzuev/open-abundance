import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { isGrowthOperator } from "@/lib/growthOperator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MEANINGFUL_EVENTS = [
  "wish_created",
  "growth_plan_saved",
  "challenge_accepted",
  "challenge_completed"
] as const;

const REPORT_EVENTS = ["app_open", "registration_completed", ...MEANINGFUL_EVENTS];

export async function GET(request: NextRequest) {
  const db = getServiceRoleClient();
  if (!db) return json({ error: "Growth analytics is not configured." }, 503);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required." }, 401);
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session." }, 401);
  if (!isGrowthOperator(authData.user.id)) return json({ error: "Growth operator access required." }, 403);

  const today = new Date();
  const defaultTo = toUtcDate(today);
  const defaultFrom = toUtcDate(new Date(today.getTime() - 29 * 86_400_000));
  const from = normalizeDate(request.nextUrl.searchParams.get("from")) ?? defaultFrom;
  const to = normalizeDate(request.nextUrl.searchParams.get("to")) ?? defaultTo;
  if (from > to) return json({ error: "from must be before to." }, 400);

  const fromTimestamp = from + "T00:00:00.000Z";
  const toExclusiveTimestamp = addDays(to, 1) + "T00:00:00.000Z";
  const [
    coreResult,
    walletResult,
    registrationsResult,
    referralsResult,
    fundingResult,
    eventsResult,
    verifiedResultsResult,
    feedbackResult
  ] = await Promise.all([
    db.from("core_accounts").select("balance"),
    db.from("wallet_accounts").select("balance"),
    db.from("user_profiles").select("user_id,created_at").lt("created_at", toExclusiveTimestamp),
    db.from("referral_edges").select("referral_user_id,referrer_user_id,claimed_at,source").lt("claimed_at", toExclusiveTimestamp),
    db.from("wallet_ledger")
      .select("user_id,direction,amount,operation_type,created_at")
      .in("operation_type", ["crypto_deposit", "wallet_core_topup"])
      .gte("created_at", fromTimestamp)
      .lt("created_at", toExclusiveTimestamp),
    db.from("product_events")
      .select("user_id,event_name,occurred_at,properties")
      .in("event_name", REPORT_EVENTS)
      .gte("occurred_at", fromTimestamp)
      .lt("occurred_at", toExclusiveTimestamp),
    db.from("challenge_completion_snapshots")
      .select("user_id,completed_at")
      .gte("completed_at", fromTimestamp)
      .lt("completed_at", toExclusiveTimestamp),
    db.from("challenge_feedback_submissions")
      .select("user_id,submitted_at,overall_rating")
      .eq("status", "submitted")
      .gte("submitted_at", fromTimestamp)
      .lt("submitted_at", toExclusiveTimestamp)
  ]);

  const firstError = [
    coreResult,
    walletResult,
    registrationsResult,
    referralsResult,
    fundingResult,
    eventsResult,
    verifiedResultsResult,
    feedbackResult
  ].find((result) => result.error)?.error;
  if (firstError) return json({ error: firstError.message }, 500);

  const registrations = (registrationsResult.data ?? []) as RegistrationRow[];
  const events = (eventsResult.data ?? []) as ProductEventRow[];
  const fundingRows = (fundingResult.data ?? []) as FundingRow[];
  const verifiedResults = verifiedResultsResult.data ?? [];
  const feedback = feedbackResult.data ?? [];
  const periodRegistrations = registrations.filter((row) => inPeriod(row.created_at, from, to));
  const periodRegistrationIds = new Set(periodRegistrations.map((row) => row.user_id));
  const activity = buildActivity(registrations, events, fundingRows, from, to);
  const referrals = (referralsResult.data ?? []) as ReferralRow[];
  const periodReferrals = referrals.filter((row) => inPeriod(row.claimed_at, from, to));
  const referredNewUsers = new Set(
    periodReferrals
      .map((row) => row.referral_user_id)
      .filter((userId) => periodRegistrationIds.has(userId))
  );
  const walletDeposits = summarizeFunding(
    fundingRows.filter((row) => row.operation_type === "crypto_deposit" && row.direction === "credit"),
    periodRegistrationIds
  );
  const coreTopups = summarizeFunding(
    fundingRows.filter((row) => row.operation_type === "wallet_core_topup" && row.direction === "debit"),
    periodRegistrationIds
  );

  return json({
    asOf: new Date().toISOString(),
    period: { from, to, timezone: "UTC" },
    current: {
      totalCore: sumBalances(coreResult.data ?? []),
      totalWallet: sumBalances(walletResult.data ?? [])
    },
    funnel: {
      registrationsTotal: registrations.length,
      registrationsInPeriod: periodRegistrations.length,
      firstDayActivatedUsers: activity.firstDayActivatedUsers,
      registrationToFirstActionRate: ratio(activity.firstDayActivatedUsers, periodRegistrations.length)
    },
    acquisition: {
      sources: propertyBreakdown(events, "registration_completed", "acquisition_source"),
      campaigns: propertyBreakdown(events, "registration_completed", "campaign")
    },
    activity: {
      activeUsersByDay: activity.activeUsersByDay,
      d1: activity.d1,
      d3: activity.d3,
      d7: activity.d7,
      retentionByCohort: activity.retentionByCohort,
      actions: actionBreakdown(events, fundingRows)
    },
    referrals: {
      referredRegistrations: referredNewUsers.size,
      activeReferrers: new Set(periodReferrals.map((row) => row.referrer_user_id)).size,
      registrationToReferralRate: ratio(referredNewUsers.size, periodRegistrations.length),
      sources: stringBreakdown(periodReferrals.map((row) => row.source ?? "unknown"))
    },
    funding: {
      walletDeposits,
      coreTopups
    },
    challenges: {
      accepted: eventCount(events, "challenge_accepted"),
      completed: eventCount(events, "challenge_completed"),
      verifiedResults: verifiedResults.length,
      feedbackSubmitted: feedback.length,
      averageFeedback: average(feedback.map((row) => row.overall_rating))
    },
    freshness: {
      lastEventAt: latest(events.map((row) => row.occurred_at)),
      lastFundingEventAt: latest(fundingRows.map((row) => row.created_at))
    }
  });
}

type RegistrationRow = {
  user_id: string;
  created_at: string;
};

type ProductEventRow = {
  user_id: string | null;
  event_name: string;
  occurred_at: string;
  properties: Json;
};

type FundingRow = {
  user_id: string;
  direction: string;
  amount: number | string;
  operation_type: string;
  created_at: string;
};

type ReferralRow = {
  referral_user_id: string;
  referrer_user_id: string;
  claimed_at: string;
  source: string | null;
};

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function buildActivity(
  registrations: RegistrationRow[],
  events: ProductEventRow[],
  fundingRows: FundingRow[],
  from: string,
  to: string
) {
  const openedByDay = new Map<string, Set<string>>();
  const meaningfulByDay = new Map<string, Set<string>>();

  for (const event of events) {
    if (!event.user_id) continue;
    const date = toUtcDate(new Date(event.occurred_at));
    if (event.event_name === "app_open") addUser(openedByDay, date, event.user_id);
    if (MEANINGFUL_EVENTS.includes(event.event_name as typeof MEANINGFUL_EVENTS[number])) {
      addUser(meaningfulByDay, date, event.user_id);
    }
  }
  for (const row of fundingRows) {
    addUser(meaningfulByDay, toUtcDate(new Date(row.created_at)), row.user_id);
  }

  const activeByDay = new Map<string, Set<string>>();
  for (const [date, openedUsers] of openedByDay) {
    const meaningfulUsers = meaningfulByDay.get(date);
    if (!meaningfulUsers) continue;
    for (const userId of openedUsers) {
      if (meaningfulUsers.has(userId)) addUser(activeByDay, date, userId);
    }
  }

  const periodRegistrations = registrations.filter((row) => inPeriod(row.created_at, from, to));
  const cohorts = new Map<string, string[]>();
  for (const registration of periodRegistrations) {
    const date = toUtcDate(new Date(registration.created_at));
    const users = cohorts.get(date) ?? [];
    users.push(registration.user_id);
    cohorts.set(date, users);
  }

  const retentionByCohort = Array.from(cohorts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, users]) => ({
      date,
      registrations: users.length,
      d1: retentionForOffset(users, date, 1, to, activeByDay),
      d3: retentionForOffset(users, date, 3, to, activeByDay),
      d7: retentionForOffset(users, date, 7, to, activeByDay)
    }));

  return {
    activeUsersByDay: Array.from(activeByDay.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, users]) => ({ date, activeUsers: users.size })),
    d1: overallRetention(cohorts, 1, to, activeByDay),
    d3: overallRetention(cohorts, 3, to, activeByDay),
    d7: overallRetention(cohorts, 7, to, activeByDay),
    retentionByCohort,
    firstDayActivatedUsers: periodRegistrations.filter((registration) => {
      const date = toUtcDate(new Date(registration.created_at));
      return meaningfulByDay.get(date)?.has(registration.user_id);
    }).length
  };
}

function summarizeFunding(rows: FundingRow[], periodRegistrationIds: Set<string>) {
  const users = new Set(rows.map((row) => row.user_id));
  const newUsers = new Set(Array.from(users).filter((userId) => periodRegistrationIds.has(userId)));
  return {
    users: users.size,
    transactions: rows.length,
    amount: rows.reduce((total, row) => total + Number(row.amount), 0),
    newUserConversionRate: ratio(newUsers.size, periodRegistrationIds.size)
  };
}

function actionBreakdown(events: ProductEventRow[], fundingRows: FundingRow[]) {
  const groups = new Map<string, { events: number; users: Set<string> }>();
  for (const event of events) {
    if (!event.user_id || !MEANINGFUL_EVENTS.includes(event.event_name as typeof MEANINGFUL_EVENTS[number])) continue;
    addAction(groups, event.event_name, event.user_id);
  }
  for (const row of fundingRows) {
    addAction(groups, row.operation_type === "crypto_deposit" ? "wallet_deposit" : "core_topup", row.user_id);
  }
  return Array.from(groups.entries())
    .map(([action, value]) => ({ action, events: value.events, users: value.users.size }))
    .sort((left, right) => right.users - left.users || left.action.localeCompare(right.action));
}

function addAction(groups: Map<string, { events: number; users: Set<string> }>, action: string, userId: string) {
  const current = groups.get(action) ?? { events: 0, users: new Set<string>() };
  current.events += 1;
  current.users.add(userId);
  groups.set(action, current);
}

function propertyBreakdown(events: ProductEventRow[], eventName: string, property: string) {
  const values = events
    .filter((event) => event.event_name === eventName)
    .map((event) => readStringProperty(event.properties, property) ?? "unknown");
  return stringBreakdown(values);
}

function readStringProperty(properties: Json, key: string): string | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const value = properties[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringBreakdown(values: string[]) {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function eventCount(events: ProductEventRow[], eventName: string) {
  return events.filter((event) => event.event_name === eventName).length;
}

function addUser(map: Map<string, Set<string>>, date: string, userId: string) {
  const users = map.get(date) ?? new Set<string>();
  users.add(userId);
  map.set(date, users);
}

function retentionForOffset(
  userIds: string[],
  cohortDate: string,
  offset: number,
  reportTo: string,
  activeByDay: Map<string, Set<string>>
) {
  const targetDate = addDays(cohortDate, offset);
  if (targetDate > reportTo || userIds.length === 0) return null;
  const activeUsers = activeByDay.get(targetDate) ?? new Set<string>();
  return userIds.filter((userId) => activeUsers.has(userId)).length / userIds.length;
}

function overallRetention(
  cohorts: Map<string, string[]>,
  offset: number,
  reportTo: string,
  activeByDay: Map<string, Set<string>>
) {
  let eligible = 0;
  let retained = 0;
  for (const [cohortDate, users] of cohorts) {
    const targetDate = addDays(cohortDate, offset);
    if (targetDate > reportTo) continue;
    eligible += users.length;
    const activeUsers = activeByDay.get(targetDate) ?? new Set<string>();
    retained += users.filter((userId) => activeUsers.has(userId)).length;
  }
  return ratio(retained, eligible);
}

function sumBalances(rows: Array<{ balance: number | string }>) {
  return rows.reduce((total, row) => total + Number(row.balance), 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function average(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((total, value) => total + value, 0) / present.length : null;
}

function latest(values: string[]) {
  return values.length ? values.sort().at(-1) ?? null : null;
}

function inPeriod(timestamp: string, from: string, to: string) {
  const date = toUtcDate(new Date(timestamp));
  return date >= from && date <= to;
}

function normalizeDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return toUtcDate(value);
}
