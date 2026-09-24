import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_STORE_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type JsonRecord = Record<string, unknown>;
type CompanionTask = JsonRecord & { id: string; role: "leader" | "member" };

export type ExpeditionNode = {
  id: string;
  kind: "discovery" | "mission" | "together" | "creation";
  state: "hidden" | "available" | "active" | "complete";
  title: string;
  description: string;
  imageUrl: string | null;
  sourceId: string | null;
  sourceView: string | null;
  reward: {
    core: number;
    progressPercent: number;
    item: JsonRecord | null;
  } | null;
  meta: JsonRecord;
};

export type ExpeditionResponse = {
  destination: {
    id: string;
    title: string;
    description: string;
    targetAmount: number | null;
    targetCurrency: string | null;
    imageUrl: string | null;
  } | null;
  futureDestinations: Array<{
    id: string;
    title: string;
    description: string;
    targetAmount: number | null;
    targetCurrency: string | null;
    imageUrl: string | null;
  }>;
  nodes: ExpeditionNode[];
  activeMission: ExpeditionNode | null;
  companions: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    role: "leader" | "member";
  }>;
  unlocks: {
    coreLevel: number;
    coreBalance: number;
    awardedCore: number;
    availableCore: number;
    artifacts: Array<{ id: string; title: string; rarity: string; artifactType: string }>;
  };
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to open the expedition.", authenticated: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !authData.user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const userId = authData.user.id;
  const requestedWishId = normalizeUuid(request.nextUrl.searchParams.get("wishId"));
  const db = supabase as any;

  const [wishResult, feedResult, challengeResult, profileResult, coreResult, leaderTasksResult, memberTasksResult, artifactResult] = await Promise.all([
    db.from("wishes")
      .select("id,title,description,target_amount,target_currency,image_url,status,updated_at")
      .eq("owner_user_id", userId)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("updated_at", { ascending: false })
      .limit(12),
    db.from("feed_posts")
      .select("id,title,body,post_type,source_key,published_at,created_at,status,visibility,system_verified")
      .eq("status", "published")
      .is("deleted_at", null)
      // Team-scoped posts require membership joins; keep the first closed pilot
      // read model to public discovery plus explicit team_tasks companions.
      .eq("visibility", "public")
      .order("published_at", { ascending: false })
      .limit(8),
    db.from("challenges")
      .select("id,title,description,core_reward_amount,category,difficulty_level,image_url,verification_logic,action_view,user_challenges(id,status,core_reward_amount,verification_data)")
      .eq("is_active", true)
      .eq("user_challenges.user_id", userId)
      .order("sort_order", { ascending: true })
      .order("difficulty_level", { ascending: true })
      .limit(30),
    db.from("user_profiles").select("level").eq("user_id", userId).maybeSingle(),
    db.from("core_accounts").select("level,balance").eq("user_id", userId).maybeSingle(),
    db.from("team_tasks").select("id,title,description,status,leader_user_id,member_user_id,expected_result,first_step").eq("leader_user_id", userId).neq("status", "completed").order("updated_at", { ascending: false }).limit(6),
    db.from("team_tasks").select("id,title,description,status,leader_user_id,member_user_id,expected_result,first_step").eq("member_user_id", userId).neq("status", "completed").order("updated_at", { ascending: false }).limit(6),
    db.from("user_artifacts").select("id,title,rarity,artifact_type,source_type").eq("user_id", userId).order("created_at", { ascending: false }).limit(12)
  ]);

  const firstError = [wishResult, feedResult, challengeResult, profileResult, coreResult, leaderTasksResult, memberTasksResult, artifactResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const wishes = (wishResult.data ?? []) as Array<JsonRecord & { id: string }>;
  const destination = (requestedWishId ? wishes.find((wish) => wish.id === requestedWishId) : wishes[0]) ?? null;
  const futureDestinations = wishes
    .filter((wish) => wish.id !== destination?.id && wish.status === "active")
    .slice(0, 5)
    .map((wish) => ({
      id: wish.id,
      title: String(wish.title ?? "A future destination"),
      description: String(wish.description ?? "Keep this wish in sight while you take the next useful step."),
      targetAmount: asNumber(wish.target_amount),
      targetCurrency: typeof wish.target_currency === "string" ? wish.target_currency : null,
      imageUrl: typeof wish.image_url === "string" ? wish.image_url : null
    }));
  const feedPosts = (feedResult.data ?? []) as JsonRecord[];
  const challenges = (challengeResult.data ?? []) as JsonRecord[];
  const currentLevel = Number(coreResult.data?.level ?? profileResult.data?.level ?? 1);
  const coreBalance = Number(coreResult.data?.balance ?? 0);
  const milestoneDefinitions = await db
    .from("challenge_milestones")
    .select("id,challenge_id,progress_weight,core_reward_amount,item_reward")
    .eq("is_active", true);
  const userChallengeToChallenge = new Map<string, string>();
  for (const challenge of challenges) {
    if (typeof challenge.id !== "string" || !Array.isArray(challenge.user_challenges)) continue;
    for (const progress of challenge.user_challenges as JsonRecord[]) {
      if (typeof progress.id === "string") userChallengeToChallenge.set(progress.id, challenge.id);
    }
  }
  const userChallengeIds = [...userChallengeToChallenge.keys()];
  const milestoneAwards = milestoneDefinitions.error || userChallengeIds.length === 0
    ? { data: [], error: milestoneDefinitions.error }
    : await db.from("challenge_milestone_awards").select("user_challenge_id,milestone_id,core_reward_amount").in("user_challenge_id", userChallengeIds);
  const milestoneMap = groupByChallenge((milestoneDefinitions.data ?? []) as JsonRecord[]);
  const awardRows = ((milestoneAwards.data ?? []) as JsonRecord[]).map((award) => ({
    ...award,
    challenge_id: userChallengeToChallenge.get(String(award.user_challenge_id ?? "")) ?? null
  }));
  const awardMap = groupByChallenge(awardRows);
  const companionTasks = uniqueById<CompanionTask>([
    ...((leaderTasksResult.data ?? []) as Array<JsonRecord & { id: string }>).map((task) => ({ ...task, role: "leader" as const })),
    ...((memberTasksResult.data ?? []) as Array<JsonRecord & { id: string }>).map((task) => ({ ...task, role: "member" as const }))
  ]).slice(0, 6);

  const missionNodes = challenges
    .map((challenge) => toMissionNode(challenge, currentLevel, milestoneMap, awardMap))
    .filter((node): node is ExpeditionNode => Boolean(node))
    .slice(0, 5);
  const discoveryNodes = feedPosts.slice(0, 4).map((post, index) => toDiscoveryNode(post, index));
  const togetherNodes = companionTasks.slice(0, 3).map((task) => toTogetherNode(task));
  const creationNodes = buildCreationNodes(destination, feedPosts, challenges);
  const nodes = [...discoveryNodes, ...missionNodes, ...togetherNodes, ...creationNodes].slice(0, 14);
  const activeMission = missionNodes.find((node) => node.state === "active") ?? missionNodes.find((node) => node.state === "available") ?? null;
  const artifacts = ((artifactResult.data ?? []) as JsonRecord[]).map((artifact) => ({
    id: String(artifact.id),
    title: String(artifact.title ?? "Artifact"),
    rarity: String(artifact.rarity ?? "common"),
    artifactType: String(artifact.artifact_type ?? "artifact")
  }));
  const awardedCore = [...awardMap.values()].flat().reduce((sum, award) => sum + Number(award.core_reward_amount ?? 0), 0);
  const response: ExpeditionResponse = {
    destination: destination ? {
      id: destination.id,
      title: String(destination.title ?? "Your next destination"),
      description: String(destination.description ?? "Choose a direction and take one useful step."),
      targetAmount: asNumber(destination.target_amount),
      targetCurrency: typeof destination.target_currency === "string" ? destination.target_currency : null,
      imageUrl: typeof destination.image_url === "string" ? destination.image_url : null
    } : null,
    futureDestinations,
    nodes,
    activeMission,
    companions: companionTasks.map((task) => ({
      id: String(task.id),
      title: String(task.title ?? "Growth circle step"),
      description: String(task.description ?? task.expected_result ?? task.first_step ?? "A shared step with your circle."),
      status: String(task.status ?? "open"),
      role: task.role
    })),
    unlocks: {
      coreLevel: currentLevel,
      coreBalance,
      awardedCore,
      availableCore: missionNodes.filter((node) => node.state === "available" || node.state === "active").reduce((sum, node) => sum + Number(node.reward?.core ?? 0), 0),
      artifacts
    }
  };

  return NextResponse.json(response, { headers: NO_STORE_HEADERS });
}

function toMissionNode(challenge: JsonRecord, currentLevel: number, milestoneMap: Map<string, JsonRecord[]>, awardMap: Map<string, JsonRecord[]>): ExpeditionNode | null {
  const id = typeof challenge.id === "string" ? challenge.id : null;
  if (!id) return null;
  const progressRows = Array.isArray(challenge.user_challenges) ? challenge.user_challenges as JsonRecord[] : [];
  const progress = progressRows[0] ?? null;
  const status = typeof progress?.status === "string" ? progress.status : null;
  const difficulty = Number(challenge.difficulty_level ?? 1);
  const milestoneRows = milestoneMap.get(id) ?? [];
  const awardRows = awardMap.get(id) ?? [];
  const totalWeight = milestoneRows.reduce((sum, row) => sum + Number(row.progress_weight ?? 0), 0);
  const awardedMilestoneIds = new Set(awardRows.map((row) => String(row.milestone_id ?? "")));
  const completedWeight = milestoneRows.reduce((sum, row) => sum + (awardedMilestoneIds.has(String(row.id ?? "")) ? Number(row.progress_weight ?? 0) : 0), 0);
  const progressPercent = totalWeight > 0 ? Math.min(100, Math.round(completedWeight / totalWeight * 100)) : status === "completed" ? 100 : 0;
  const state: ExpeditionNode["state"] = status === "completed" ? "complete" : status === "accepted" ? "active" : difficulty > currentLevel + 1 ? "hidden" : "available";
  return {
    id: `mission:${id}`,
    kind: "mission",
    state,
    title: localized(challenge.title, "Mission"),
    description: localized(challenge.description, "Take one verified step toward your destination."),
    imageUrl: typeof challenge.image_url === "string" ? challenge.image_url : null,
    sourceId: id,
    sourceView: typeof challenge.action_view === "string" ? challenge.action_view : "challenges",
    reward: { core: Number(challenge.core_reward_amount ?? 0), progressPercent, item: (milestoneRows.find((row) => row.item_reward)?.item_reward as JsonRecord | null | undefined) ?? null },
    meta: { category: challenge.category ?? "mission", difficulty, activityType: challenge.activity_type ?? "mission", rewardMode: challenge.reward_mode ?? "guaranteed" }
  };
}

function toDiscoveryNode(post: JsonRecord, index: number): ExpeditionNode {
  const id = String(post.id);
  return {
    id: `discovery:${id}`,
    kind: "discovery",
    state: "available",
    title: String(post.title ?? post.source_key ?? "A new possibility"),
    description: String(post.body ?? "Explore a story and see what it makes possible for you."),
    imageUrl: null,
    sourceId: id,
    sourceView: "feed",
    reward: null,
    meta: { postType: post.post_type ?? "manual", verified: Boolean(post.system_verified), rank: index + 1 }
  };
}

function toTogetherNode(task: CompanionTask): ExpeditionNode {
  const id = String(task.id);
  return {
    id: `together:${id}`,
    kind: "together",
    state: task.status === "submitted" || task.status === "under_review" ? "active" : "available",
    title: String(task.title ?? "Growth circle"),
    description: String(task.description ?? task.expected_result ?? "Ask for help or support someone in your circle."),
    imageUrl: null,
    sourceId: id,
    sourceView: "teams",
    reward: null,
    meta: { role: task.role, status: task.status ?? "open" }
  };
}

function buildCreationNodes(destination: JsonRecord | null, posts: JsonRecord[], challenges: JsonRecord[]): ExpeditionNode[] {
  const nodes: ExpeditionNode[] = [];
  if (destination) {
    nodes.push({
      id: `creation:wish:${destination.id}`,
      kind: "creation",
      state: "available",
      title: "Make the next useful thing",
      description: "Turn your destination into a small result someone else can learn from.",
      imageUrl: typeof destination.image_url === "string" ? destination.image_url : null,
      sourceId: String(destination.id),
      sourceView: "goals.notes",
      reward: null,
      meta: { destination: true }
    });
  }
  if (posts.length > 0 || challenges.length > 0) {
    nodes.push({
      id: "creation:share-solution",
      kind: "creation",
      state: "available",
      title: "Share a reusable solution",
      description: "Publish a practical result with enough context for another person to try it.",
      imageUrl: null,
      sourceId: null,
      sourceView: "people.blog",
      reward: null,
      meta: { requiresUsefulResult: true }
    });
  }
  return nodes;
}

function localized(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord;
    for (const key of ["ru", "en"]) if (typeof record[key] === "string" && record[key].trim()) return record[key] as string;
  }
  return fallback;
}

function normalizeUuid(value: string | null): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function groupByChallenge(rows: JsonRecord[]): Map<string, JsonRecord[]> {
  const grouped = new Map<string, JsonRecord[]>();
  for (const row of rows) {
    const challengeId = typeof row.challenge_id === "string" ? row.challenge_id : null;
    if (!challengeId) continue;
    const current = grouped.get(challengeId) ?? [];
    current.push(row);
    grouped.set(challengeId, current);
  }
  return grouped;
}

function uniqueById<T extends { id: unknown }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
