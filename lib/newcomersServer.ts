import { tasksDoneSince, type QuestCompletionRow } from "@/lib/simpleQuests";

export type NewcomerProgress = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** How the person is linked to the helper. */
  via: "link" | "team";
  joinedAt: string | null;
  /** Tasks the newcomer completed after the helper took «Помоги новичку». */
  doneSince: number;
};

/**
 * The helper's newcomers for «Помоги новичку»: people who came by their link or are in their team,
 * newest first, with how many tasks each completed since the helper took the task. Uses the service client.
 */
export async function loadNewcomerProgress(db: any, helperUserId: string, takenAt: string | null): Promise<NewcomerProgress[]> {
  const [referrals, members] = await Promise.all([
    db.from("referral_edges").select("referral_user_id,claimed_at").eq("referrer_user_id", helperUserId).limit(500),
    db.from("team_memberships").select("member_user_id,assigned_at").eq("leader_user_id", helperUserId).eq("is_active", true).limit(500)
  ]);
  if (referrals.error) throw referrals.error;
  if (members.error) throw members.error;

  const people = new Map<string, { via: "link" | "team"; joinedAt: string | null }>();
  for (const row of referrals.data ?? []) {
    if (row.referral_user_id && row.referral_user_id !== helperUserId) people.set(row.referral_user_id, { via: "link", joinedAt: row.claimed_at ?? null });
  }
  for (const row of members.data ?? []) {
    if (row.member_user_id && row.member_user_id !== helperUserId && !people.has(row.member_user_id)) {
      people.set(row.member_user_id, { via: "team", joinedAt: row.assigned_at ?? null });
    }
  }
  const ids = [...people.keys()];
  if (ids.length === 0) return [];

  const [profiles, progress] = await Promise.all([
    db.from("user_profiles").select("user_id,username,display_name,avatar_url,created_at").in("user_id", ids),
    db.from("user_challenges").select("user_id,challenge_id,status,reward_settled_at,updated_at,challenges(category)").in("user_id", ids).eq("status", "completed")
  ]);
  if (profiles.error) throw profiles.error;
  if (progress.error) throw progress.error;

  const byUser = new Map<string, QuestCompletionRow[]>();
  for (const row of progress.data ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ challenge_id: row.challenge_id, status: row.status, reward_settled_at: row.reward_settled_at, updated_at: row.updated_at, category: row.challenges?.category ?? null });
    byUser.set(row.user_id, list);
  }
  const profileById = new Map<string, any>((profiles.data ?? []).map((profile: any) => [profile.user_id, profile]));

  return ids
    .map((id) => {
      const profile = profileById.get(id);
      const link = people.get(id)!;
      return {
        userId: id,
        name: profile?.display_name || profile?.username || null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        via: link.via,
        joinedAt: profile?.created_at ?? link.joinedAt,
        doneSince: tasksDoneSince(byUser.get(id) ?? [], takenAt)
      };
    })
    .sort((a, b) => Number(b.doneSince > 0) - Number(a.doneSince > 0) || String(b.joinedAt ?? "").localeCompare(String(a.joinedAt ?? "")));
}
