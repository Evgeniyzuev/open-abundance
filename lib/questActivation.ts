import { recordProductEvent } from "@/lib/serverAnalytics";

type Db = any;

/**
 * Makes one quest the person's active quest. An unstarted quest is accepted at the same time (the path's next quest
 * becomes active by itself); a completed quest is never touched. Only one row per person carries is_active.
 */
export async function activateQuest(db: Db, userId: string, challengeId: string, options: { auto: boolean }): Promise<{ status: string } | { error: string }> {
  const { data: existing, error: existingError } = await db
    .from("user_challenges")
    .select("status,is_active")
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (existingError) return { error: existingError.message };

  const status = String(existing?.status ?? "").trim().toLowerCase();
  if (status === "completed") return { error: "This quest is already completed." };
  if (existing?.is_active && (status === "accepted" || status === "failed")) return { status };

  const { error: clearError } = await db.from("user_challenges").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  if (clearError) return { error: clearError.message };

  const nextStatus = status === "accepted" || status === "failed" ? status : "accepted";
  const { error: upsertError } = await db.from("user_challenges").upsert(
    { user_id: userId, challenge_id: challengeId, status: nextStatus, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id,challenge_id" }
  );
  if (upsertError) return { error: upsertError.message };

  if (nextStatus !== status) {
    await recordProductEvent({ entityId: challengeId, entityType: "challenge", eventName: "challenge_accepted", properties: { auto: options.auto, via: "quest_active" }, source: "server", userId });
  }
  await recordProductEvent({ entityId: challengeId, entityType: "challenge", eventName: "quest_activated", properties: { auto: options.auto }, source: "server", userId });
  return { status: nextStatus };
}
