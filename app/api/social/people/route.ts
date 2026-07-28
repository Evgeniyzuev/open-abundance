import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type UserProfile = Pick<Tables<"user_profiles">, "user_id" | "username" | "display_name" | "avatar_url" | "avatar_position" | "level" | "bio" | "created_at">;
type PeopleFilter = "nearby" | "team" | "referrals" | "same_level" | "active" | "search";
type TrustSummary = {
  confirmed: number;
  helped: number;
  deals: number;
  recent: number;
  label: "new" | "confirmed" | "trusted";
};
type TeamSummary = {
  strength: number;
  members: number;
};
type InfluenceSummary = {
  label: "new" | "active" | "creator";
  publicPosts: number;
  referrals: number;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const search = normalizeSearch(request.nextUrl.searchParams.get("q"));
    const filter = normalizeFilter(request.nextUrl.searchParams.get("filter"), search ? "search" : "nearby");
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

    const viewerProfile = await loadProfile(supabase, user.id);
    const [teamIds, referralIds, activeAuthorIds] = await Promise.all([
      loadTeamUserIds(supabase, user.id),
      loadReferralUserIds(supabase, user.id),
      loadRecentPublicAuthorIds(supabase)
    ]);

    let query = supabase
      .from("user_profiles")
      .select("user_id,username,display_name,avatar_url,avatar_position,level,bio,created_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(search ? Math.max(limit * 3, 60) : Math.max(limit * 2, 40));

    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`display_name.ilike.${pattern},username.ilike.${pattern},bio.ilike.${pattern}`);
    } else if (filter === "team") {
      if (!teamIds.size) return NextResponse.json({ people: [], filter, query: search }, { headers: NO_STORE_HEADERS });
      query = query.in("user_id", Array.from(teamIds));
    } else if (filter === "referrals") {
      if (!referralIds.size) return NextResponse.json({ people: [], filter, query: search }, { headers: NO_STORE_HEADERS });
      query = query.in("user_id", Array.from(referralIds));
    } else if (filter === "same_level") {
      query = query.eq("level", viewerProfile?.level ?? 0);
    } else if (filter === "active") {
      if (!activeAuthorIds.size) return NextResponse.json({ people: [], filter, query: search }, { headers: NO_STORE_HEADERS });
      query = query.in("user_id", Array.from(activeAuthorIds));
    } else {
      const viewerLevel = viewerProfile?.level ?? 0;
      query = query.gte("level", Math.max(0, viewerLevel - 1)).lte("level", viewerLevel + 1);
    }

    const { data, error: profilesError } = await query;
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500, headers: NO_STORE_HEADERS });

    const profiles = ((data ?? []) as UserProfile[])
      .filter((profile) => profile.user_id !== user.id || search || filter === "same_level")
      .slice(0, Math.max(limit * 2, limit));
    const userIds = profiles.map((profile) => profile.user_id);

    const [contactIds, trustSummaries, teamSummaries, influenceSummaries] = await Promise.all([
      loadContactIds(supabase, user.id, userIds),
      loadTrustSummaries(supabase, userIds),
      loadTeamSummaries(supabase, userIds),
      loadInfluenceSummaries(supabase, userIds)
    ]);

    const people = profiles
      .map((profile) => ({
        profile,
        headline: buildHeadline(profile),
        relation: {
          isSelf: profile.user_id === user.id,
          isContact: contactIds.has(profile.user_id),
          isTeam: teamIds.has(profile.user_id),
          isReferral: referralIds.has(profile.user_id)
        },
        publicStats: {
          level: profile.level,
          trust: trustSummaries.get(profile.user_id) ?? emptyTrustSummary(),
          team: teamSummaries.get(profile.user_id) ?? { strength: 0, members: 0 },
          influence: influenceSummaries.get(profile.user_id) ?? { label: "new", publicPosts: 0, referrals: 0 }
        },
        lastPublicActivityAt: influenceSummaries.get(profile.user_id)?.publicPosts ? null : null
      }))
      .sort((a, b) => scorePerson(b, filter, teamIds, referralIds, activeAuthorIds, viewerProfile?.level ?? 0) - scorePerson(a, filter, teamIds, referralIds, activeAuthorIds, viewerProfile?.level ?? 0))
      .slice(0, limit);

    return NextResponse.json({ people, filter, query: search }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load people." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadProfile(supabase: SupabaseClient<Database>, userId: string): Promise<Pick<UserProfile, "user_id" | "level"> | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,level")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadTeamUserIds(supabase: SupabaseClient<Database>, viewerUserId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("member_user_id,leader_user_id")
    .eq("is_active", true)
    .or(`member_user_id.eq.${viewerUserId},leader_user_id.eq.${viewerUserId}`);

  if (error) throw error;
  const ids = new Set<string>();
  (data ?? []).forEach((row) => {
    if (row.member_user_id && row.member_user_id !== viewerUserId) ids.add(row.member_user_id);
    if (row.leader_user_id && row.leader_user_id !== viewerUserId) ids.add(row.leader_user_id);
  });
  return ids;
}

async function loadReferralUserIds(supabase: SupabaseClient<Database>, viewerUserId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("referral_edges")
    .select("referral_user_id,referrer_user_id")
    .or(`referral_user_id.eq.${viewerUserId},referrer_user_id.eq.${viewerUserId}`);

  if (error) throw error;
  const ids = new Set<string>();
  (data ?? []).forEach((row) => {
    if (row.referral_user_id && row.referral_user_id !== viewerUserId) ids.add(row.referral_user_id);
    if (row.referrer_user_id && row.referrer_user_id !== viewerUserId) ids.add(row.referrer_user_id);
  });
  return ids;
}

async function loadRecentPublicAuthorIds(supabase: SupabaseClient<Database>): Promise<Set<string>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("feed_posts")
    .select("author_user_id")
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .gte("published_at", since)
    .limit(120);

  if (error) throw error;
  return new Set((data ?? []).flatMap((row) => row.author_user_id ? [row.author_user_id] : []));
}

async function loadContactIds(supabase: SupabaseClient<Database>, viewerUserId: string, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data, error } = await supabase
    .from("user_contacts")
    .select("contact_user_id")
    .eq("owner_user_id", viewerUserId)
    .eq("status", "active")
    .in("contact_user_id", userIds);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.contact_user_id));
}

async function loadTrustSummaries(supabase: SupabaseClient<Database>, userIds: string[]): Promise<Map<string, TrustSummary>> {
  const summaries = new Map<string, TrustSummary>();
  if (!userIds.length) return summaries;

  const { data, error } = await supabase
    .from("reciprocity_balances")
    .select("user_id,help_given_count,help_received_count,deals_completed_count,confirmations_given_count,confirmations_received_count,recent_positive_events")
    .in("user_id", userIds);

  if (error) throw error;
  (data ?? []).forEach((row) => {
    const confirmed = row.help_given_count + row.help_received_count + row.deals_completed_count + row.confirmations_given_count + row.confirmations_received_count;
    summaries.set(row.user_id, {
      confirmed,
      helped: row.help_given_count + row.help_received_count,
      deals: row.deals_completed_count,
      recent: row.recent_positive_events,
      label: confirmed >= 8 ? "trusted" : confirmed > 0 ? "confirmed" : "new"
    });
  });
  return summaries;
}

async function loadTeamSummaries(supabase: SupabaseClient<Database>, userIds: string[]): Promise<Map<string, TeamSummary>> {
  const summaries = new Map<string, TeamSummary>();
  if (!userIds.length) return summaries;

  const { data: memberships, error: membershipsError } = await supabase
    .from("team_memberships")
    .select("leader_user_id,member_user_id")
    .eq("is_active", true)
    .in("leader_user_id", userIds);

  if (membershipsError) throw membershipsError;
  const rows = memberships ?? [];
  const memberIds = Array.from(new Set(rows.map((row) => row.member_user_id)));
  const { data: memberProfiles, error: memberProfilesError } = memberIds.length
    ? await supabase.from("user_profiles").select("user_id,level").in("user_id", memberIds)
    : { data: [], error: null };

  if (memberProfilesError) throw memberProfilesError;
  const levels = new Map((memberProfiles ?? []).map((profile) => [profile.user_id, profile.level]));
  rows.forEach((row) => {
    if (!row.leader_user_id) return;
    const current = summaries.get(row.leader_user_id) ?? { strength: 0, members: 0 };
    current.members += 1;
    current.strength += levels.get(row.member_user_id) ?? 0;
    summaries.set(row.leader_user_id, current);
  });
  return summaries;
}

async function loadInfluenceSummaries(supabase: SupabaseClient<Database>, userIds: string[]): Promise<Map<string, InfluenceSummary>> {
  const summaries = new Map<string, InfluenceSummary>();
  if (!userIds.length) return summaries;

  const [postsResult, referralsResult] = await Promise.all([
    supabase
      .from("feed_posts")
      .select("author_user_id")
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .in("author_user_id", userIds)
      .limit(500),
    supabase
      .from("referral_edges")
      .select("referrer_user_id")
      .in("referrer_user_id", userIds)
      .limit(500)
  ]);

  if (postsResult.error) throw postsResult.error;
  if (referralsResult.error) throw referralsResult.error;

  userIds.forEach((userId) => summaries.set(userId, { label: "new", publicPosts: 0, referrals: 0 }));
  (postsResult.data ?? []).forEach((row) => {
    if (!row.author_user_id) return;
    const current = summaries.get(row.author_user_id) ?? { label: "new", publicPosts: 0, referrals: 0 };
    current.publicPosts += 1;
    summaries.set(row.author_user_id, current);
  });
  (referralsResult.data ?? []).forEach((row) => {
    const current = summaries.get(row.referrer_user_id) ?? { label: "new", publicPosts: 0, referrals: 0 };
    current.referrals += 1;
    summaries.set(row.referrer_user_id, current);
  });
  summaries.forEach((summary) => {
    summary.label = summary.referrals >= 3 || summary.publicPosts >= 8 ? "creator" : summary.referrals > 0 || summary.publicPosts > 0 ? "active" : "new";
  });

  return summaries;
}

function scorePerson(
  item: { profile: UserProfile; publicStats: { trust: TrustSummary; team: TeamSummary; influence: InfluenceSummary } },
  filter: PeopleFilter,
  teamIds: Set<string>,
  referralIds: Set<string>,
  activeAuthorIds: Set<string>,
  viewerLevel: number
): number {
  let score = 0;
  if (teamIds.has(item.profile.user_id)) score += 40;
  if (referralIds.has(item.profile.user_id)) score += 34;
  if (activeAuthorIds.has(item.profile.user_id)) score += 18;
  if (item.profile.level === viewerLevel) score += 14;
  if (Math.abs(item.profile.level - viewerLevel) === 1) score += 9;
  score += Math.min(item.publicStats.trust.confirmed, 10);
  score += Math.min(item.publicStats.team.strength, 20) / 2;
  score += Math.min(item.publicStats.influence.publicPosts + item.publicStats.influence.referrals * 2, 16);
  if (filter === "team" && teamIds.has(item.profile.user_id)) score += 40;
  if (filter === "referrals" && referralIds.has(item.profile.user_id)) score += 40;
  if (filter === "active" && activeAuthorIds.has(item.profile.user_id)) score += 20;
  return score;
}

function buildHeadline(profile: UserProfile): string | null {
  const bio = profile.bio?.trim();
  if (!bio) return null;
  return bio.length > 96 ? `${bio.slice(0, 93)}...` : bio;
}

function emptyTrustSummary(): TrustSummary {
  return { confirmed: 0, helped: 0, deals: 0, recent: 0, label: "new" };
}

function normalizeFilter(value: unknown, fallback: PeopleFilter): PeopleFilter {
  return value === "team" || value === "referrals" || value === "same_level" || value === "active" || value === "search" || value === "nearby"
    ? value
    : fallback;
}

function normalizeSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[,%()]/g, " ").trim().slice(0, 80);
}

function clampLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 5), 50);
}
