import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { supabase, user, error } = await getAuthenticatedUser(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const [membershipResult, directMembershipsResult, queueResult, leadershipResult, tasksResult, referralResult, firstResultResult, activatedResult, retainedResult] = await Promise.all([
      supabase
        .from("team_memberships")
        .select("*")
        .eq("member_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("team_memberships")
        .select("member_user_id,assigned_at")
        .eq("leader_user_id", user.id)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("team_assignment_queue")
        .select("reason,attempt_count,last_attempt_at,created_at")
        .eq("member_user_id", user.id)
        .maybeSingle(),
      supabase.rpc("team_leadership_snapshot", { p_user_id: user.id }),
      supabase
        .from("team_tasks")
        .select("id,leader_user_id,member_user_id,status,newcomer_eligible")
        .or(`leader_user_id.eq.${user.id},member_user_id.eq.${user.id}`)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_edges")
        .select("referral_user_id", { count: "exact", head: true })
        .eq("referrer_user_id", user.id),
      supabase
        .from("challenge_completion_snapshots")
        .select("challenge_category")
        .eq("user_id", user.id),
      supabase.rpc("count_activated_referrals", { p_referrer_user_id: user.id }),
      supabase.rpc("count_retained_referrals", { p_referrer_user_id: user.id })
    ]);

    if (membershipResult.error) {
      return NextResponse.json({ error: membershipResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (directMembershipsResult.error) {
      return NextResponse.json({ error: directMembershipsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (queueResult.error) {
      return NextResponse.json({ error: queueResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (leadershipResult.error) {
      return NextResponse.json({ error: leadershipResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (tasksResult.error) {
      return NextResponse.json({ error: tasksResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (referralResult.error) {
      return NextResponse.json({ error: referralResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (firstResultResult.error) {
      return NextResponse.json({ error: firstResultResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (activatedResult.error) {
      return NextResponse.json({ error: activatedResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (retainedResult.error) {
      return NextResponse.json({ error: retainedResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const membership = membershipResult.data;
    const directMemberships = directMembershipsResult.data;
    const queue = queueResult.data;
    const [leadership] = leadershipResult.data ?? [];
    const tasks = tasksResult.data ?? [];
    const hasFirstResult = (firstResultResult.data ?? []).some((snapshot) => Boolean(snapshot.challenge_category && snapshot.challenge_category !== "onboarding"));
    const registeredReferrals = referralResult.count ?? 0;
    const activatedReferrals = Number(activatedResult.data ?? 0);
    const retainedReferrals = Number(retainedResult.data ?? 0);
    const memberTasks = tasks.filter((task) => task.member_user_id === user.id);
    const leaderTasks = tasks.filter((task) => task.leader_user_id === user.id);
    const memberOpen = memberTasks.filter((task) => ["proposed", "accepted", "returned"].includes(task.status)).length;
    const memberSubmitted = memberTasks.filter((task) => task.status === "submitted").length;
    const leaderReview = leaderTasks.filter((task) => task.status === "submitted").length;
    const leaderOpen = leaderTasks.filter((task) => ["proposed", "accepted", "returned"].includes(task.status)).length;
    const isLeader = (directMemberships ?? []).length > 0 || leaderReview > 0 || leaderOpen > 0;
    const helpCompleted = leaderTasks.some((task) => task.status === "completed" && task.newcomer_eligible);
    const leaderPath = isLeader ? {
        firstResultCompleted: hasFirstResult,
        inviteUnlocked: hasFirstResult,
        referralRegistered: registeredReferrals > 0,
        newcomerHelpCompleted: helpCompleted,
        next: !hasFirstResult ? "publish_result" : registeredReferrals === 0 ? "invite_participant" : helpCompleted ? "complete" : "help_newcomer"
      } as const : null;

    const leaderProfile = membership?.leader_user_id
      ? await loadProfile(supabase, membership.leader_user_id)
      : null;

    const memberIds = directMemberships?.map((item) => item.member_user_id) ?? [];
    const memberProfiles = memberIds.length ? await loadProfiles(supabase, memberIds) : [];
    const directMembers = (directMemberships ?? []).map((item) => ({
      userId: item.member_user_id,
      assignedAt: item.assigned_at,
      profile: memberProfiles.find((profile) => profile.user_id === item.member_user_id) ?? null,
      leadershipCost: Math.max(
        memberProfiles.find((profile) => profile.user_id === item.member_user_id)?.level ?? 0,
        0
      )
    }));

    return NextResponse.json(
        {
          membership,
        leader: membership?.leader_user_id
          ? { type: "user", profile: leaderProfile }
          : { type: "system", profile: null },
          directMembers,
          assignment: {
            status: membership?.leader_user_id
              ? "assigned"
              : queue
                ? "queued"
                : membership
                  ? "system"
                  : "missing",
            reason: queue?.reason ?? null,
            attemptCount: queue?.attempt_count ?? 0,
            queuedAt: queue?.created_at ?? null,
            lastAttemptAt: queue?.last_attempt_at ?? null
          },
          leadership: leadership ?? {
            base_points: 0,
            bonus_points: 0,
            total_points: 0,
            used_points: 0,
            free_points: 0,
            overcommitted: false
          },
          taskCounts: {
            memberOpen,
            memberSubmitted,
            leaderReview,
            leaderOpen,
            total: tasks.length
          },
          nextAction: isLeader
            ? (leaderReview > 0 ? "review_task" : leaderPath?.next ?? "complete")
            : (memberSubmitted > 0 ? "await_review" : memberOpen > 0 ? "work_on_task" : "none"),
          leaderPath,
          referralQuality: {
            registered: registeredReferrals,
            activated: activatedReferrals,
            retainedD7: retainedReferrals
          }
        },
      { headers: NO_STORE_HEADERS }
    );
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Failed to load team." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function loadProfile(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,avatar_position,level,created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadProfiles(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userIds: string[]) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,username,display_name,avatar_url,avatar_position,level,created_at")
    .in("user_id", userIds);

  if (error) throw error;
  return data ?? [];
}
