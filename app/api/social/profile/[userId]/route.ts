import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import type { Database, Tables } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import {
  canViewVisibility,
  normalizeProfileVisibility,
  normalizeProfileVisibilitySettings
} from "@/lib/socialProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PublicWish = Tables<"wishes"> & { viewer_has_copy: boolean };
const PUBLIC_ECONOMY_KEYS = [
  "wallet_inflows_total",
  "wallet_outflows_total",
  "marketplace_sales_gross",
  "marketplace_purchases_gross",
  "marketplace_completed_sales_count",
  "marketplace_completed_purchase_count",
  "core_growth_total",
  "core_level_end"
] as const;

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const targetUserId = normalizeUuid(params.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const [profileResult, settingsResult, relation, linksResult, economyVisibilityResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("user_id,username,display_name,avatar_url,avatar_position,level,bio,created_at")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      supabase
        .from("user_profile_visibility_settings")
        .select("settings")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      loadRelation(supabase, targetUserId, user.id),
      supabase
        .from("user_profile_links")
        .select("*")
        .eq("user_id", targetUserId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("user_economy_metric_visibility")
        .select("metric_key, period_type")
        .eq("user_id", targetUserId)
        .eq("is_public", true)
    ]);

    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (linksResult.error) return NextResponse.json({ error: linksResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (economyVisibilityResult.error) return NextResponse.json({ error: economyVisibilityResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    if (!profileResult.data) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers: NO_STORE_HEADERS });

    const visibilitySettings = normalizeProfileVisibilitySettings(settingsResult.data?.settings);
    const canViewWishes = canViewVisibility(visibilitySettings.wishes, relation);
    const profile = {
      ...profileResult.data,
      bio: canViewVisibility(visibilitySettings.bio, relation) ? profileResult.data.bio : null
    };
    const links = (linksResult.data ?? []).filter((link) => canViewVisibility(normalizeProfileVisibility(link.visibility), relation));
    const publicWishes = canViewWishes ? await loadPublicWishes(supabase, targetUserId, user.id) : [];
    const economyMetrics = await loadPublicEconomyMetrics(supabase, targetUserId, economyVisibilityResult.data ?? []);

    return NextResponse.json(
      {
        profile,
        links,
        publicWishes,
        economyMetrics,
        relation,
        visibleBlocks: {
          bio: canViewVisibility(visibilitySettings.bio, relation),
          income: canViewVisibility(visibilitySettings.income, relation),
          expenses: canViewVisibility(visibilitySettings.expenses, relation),
          wishes: canViewWishes,
          achievements: canViewVisibility(visibilitySettings.achievements, relation),
          team: canViewVisibility(visibilitySettings.team, relation),
          posts: canViewVisibility(visibilitySettings.posts, relation)
        }
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load public profile." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadPublicEconomyMetrics(
  supabase: SupabaseClient<Database>,
  targetUserId: string,
  visibilityRows: Array<{ metric_key: string; period_type: string }>
) {
  const allowedRows = visibilityRows.filter((row) =>
    (PUBLIC_ECONOMY_KEYS as readonly string[]).includes(row.metric_key) &&
    ["day", "month", "year", "lifetime"].includes(row.period_type)
  );
  if (!allowedRows.length) return [];

  const periodTypes = Array.from(new Set(allowedRows.map((row) => row.period_type)));
  const { data, error } = await supabase
    .from("user_economy_metrics")
    .select("period_type, period_key, wallet_inflows_total, wallet_outflows_total, marketplace_sales_gross, marketplace_purchases_gross, marketplace_completed_sales_count, marketplace_completed_purchase_count, core_growth_total, core_level_end")
    .eq("user_id", targetUserId)
    .eq("currency_code", "$")
    .in("period_type", periodTypes);
  if (error) throw error;

  const currentKeys = new Map<string, string>([
    ["lifetime", "lifetime"],
    ["year", new Date().toISOString().slice(0, 4)],
    ["month", new Date().toISOString().slice(0, 7)],
    ["day", new Date().toISOString().slice(0, 10)]
  ]);
  const allowedByPeriod = new Map<string, Set<string>>();
  for (const row of allowedRows) {
    const keys = allowedByPeriod.get(row.period_type) ?? new Set<string>();
    keys.add(row.metric_key);
    allowedByPeriod.set(row.period_type, keys);
  }

  return (data ?? [])
    .filter((row) => row.period_key === currentKeys.get(row.period_type))
    .map((row) => {
      const allowed = allowedByPeriod.get(row.period_type) ?? new Set<string>();
      const result: Record<string, unknown> = { periodType: row.period_type, periodKey: row.period_key };
      for (const key of PUBLIC_ECONOMY_KEYS) {
        if (allowed.has(key)) result[key] = row[key];
      }
      return result;
    });
}

async function loadRelation(supabase: SupabaseClient<Database>, targetUserId: string, viewerUserId: string) {
  const isSelf = targetUserId === viewerUserId;
  const [contactResult, teamResult] = await Promise.all([
    isSelf
      ? { count: 1, error: null }
      : supabase
          .from("user_contacts")
          .select("owner_user_id", { count: "exact", head: true })
          .eq("owner_user_id", targetUserId)
          .eq("contact_user_id", viewerUserId)
          .eq("status", "active"),
    isSelf
      ? { count: 1, error: null }
      : supabase
          .from("team_memberships")
          .select("member_user_id", { count: "exact", head: true })
          .eq("is_active", true)
          .or(
            `and(member_user_id.eq.${targetUserId},leader_user_id.eq.${viewerUserId}),and(member_user_id.eq.${viewerUserId},leader_user_id.eq.${targetUserId})`
          )
  ]);

  if (contactResult.error) throw contactResult.error;
  if (teamResult.error) throw teamResult.error;

  return {
    isSelf,
    isContact: isSelf || Boolean(contactResult.count),
    isTeam: isSelf || Boolean(teamResult.count),
    isFollower: false
  };
}

async function loadPublicWishes(supabase: SupabaseClient<Database>, targetUserId: string, viewerUserId: string): Promise<PublicWish[]> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .eq("owner_user_id", targetUserId)
    .eq("visibility", "public")
    .in("status", ["active", "completed"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw error;

  const wishes = (data ?? []) as Tables<"wishes">[];
  if (!wishes.length) return [];
  if (targetUserId === viewerUserId) {
    return wishes.map((wish) => ({ ...wish, viewer_has_copy: true }));
  }

  const sourceWishIds = wishes.map((wish) => wish.id);
  const originalWishIds = Array.from(new Set(wishes.map((wish) => wish.original_wish_id ?? wish.id)));
  const [directCopies, originalCopies] = await Promise.all([
    supabase
      .from("wishes")
      .select("cloned_from_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("cloned_from_wish_id", sourceWishIds),
    supabase
      .from("wishes")
      .select("original_wish_id")
      .eq("owner_user_id", viewerUserId)
      .is("deleted_at", null)
      .in("original_wish_id", originalWishIds)
  ]);

  if (directCopies.error) throw directCopies.error;
  if (originalCopies.error) throw originalCopies.error;

  const copiedSourceIds = new Set((directCopies.data ?? []).map((wish) => wish.cloned_from_wish_id).filter(Boolean));
  const copiedOriginalIds = new Set((originalCopies.data ?? []).map((wish) => wish.original_wish_id).filter(Boolean));

  return wishes.map((wish) => {
    const originalWishId = wish.original_wish_id ?? wish.id;
    return {
      ...wish,
      viewer_has_copy: copiedSourceIds.has(wish.id) || copiedOriginalIds.has(originalWishId)
    };
  });
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
