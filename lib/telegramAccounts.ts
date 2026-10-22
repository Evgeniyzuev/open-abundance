// Server helpers for telegram_accounts: which Open Abundance account a Telegram account signs in to.
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { isTelegramOnlyEmail, type TelegramUser } from "@/lib/telegramInitData";

export type Db = ReturnType<typeof createServiceSupabaseClient>;
export type AttachResult = { ok: true } | { ok: false; status: number; code: string; error: string };

/** `ready` is false until the telegram_accounts migration is applied; sign-in then works without links. */
export async function readTelegramMapping(supabase: Db, telegramId: number): Promise<{ ready: boolean; userId: string | null }> {
  const { data, error } = await (supabase as any).from("telegram_accounts").select("user_id").eq("telegram_id", telegramId).maybeSingle();
  if (error) return { ready: false, userId: null };
  return { ready: true, userId: data?.user_id ?? null };
}

export async function saveTelegramMapping(supabase: Db, user: TelegramUser, userId: string): Promise<void> {
  const { error } = await (supabase as any).from("telegram_accounts").upsert({
    telegram_id: user.id,
    user_id: userId,
    telegram_username: user.username,
    updated_at: new Date().toISOString()
  }, { onConflict: "telegram_id" });
  if (error) throw error;
}

export async function accountEmail(supabase: Db, userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

/** One-time token the browser exchanges for a session (verifyOtp with token_hash). No email is sent. */
export async function signInToken(supabase: Db, email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Sign-in token was not created.");
  return tokenHash;
}

/**
 * Points a Telegram account at an existing account (Google or email). If the Telegram account already
 * had its own account made from Telegram, it is let go only when empty; real accounts are never merged silently.
 */
export async function attachTelegram(supabase: Db, telegramUser: TelegramUser, targetUserId: string): Promise<AttachResult> {
  const mapping = await readTelegramMapping(supabase, telegramUser.id);
  if (!mapping.ready) return { ok: false, status: 503, code: "link_unavailable", error: "Linking Telegram is not available yet." };
  if (mapping.userId && mapping.userId !== targetUserId) {
    const current = await accountEmail(supabase, mapping.userId);
    if (current && !isTelegramOnlyEmail(current)) {
      return { ok: false, status: 409, code: "telegram_linked_elsewhere", error: "This Telegram is linked to another account." };
    }
    if (current && !(await isEmptyAccount(supabase, mapping.userId))) {
      return { ok: false, status: 409, code: "telegram_account_has_data", error: "This Telegram already has its own account with data." };
    }
  }
  await saveTelegramMapping(supabase, telegramUser, targetUserId);
  return { ok: true };
}

/**
 * Nothing to lose: no Wallet balance, no wishes, and nothing beyond the sign-up starter (its Core reward and its
 * completed challenge). The starter is given to every new account, so without it counted here a person who tapped
 * "continue as ..." by mistake could never link the account they already have.
 */
async function isEmptyAccount(supabase: Db, userId: string): Promise<boolean> {
  const [core, wallet, wishes, signup, challenges] = await Promise.all([
    supabase.from("core_accounts").select("balance").eq("user_id", userId).maybeSingle(),
    supabase.from("wallet_accounts").select("balance").eq("user_id", userId).maybeSingle(),
    supabase.from("wishes").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).is("deleted_at", null),
    supabase.from("challenges").select("id,core_reward_amount").eq("verification_logic", "signup").order("sort_order", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("user_challenges").select("challenge_id").eq("user_id", userId)
  ]);
  if (core.error || wallet.error || wishes.error || signup.error || challenges.error) return false;
  const starterCore = Number(signup.data?.core_reward_amount ?? 0);
  const onlyStarterChallenge = (challenges.data ?? []).every((row) => row.challenge_id === signup.data?.id);
  return Number(core.data?.balance ?? 0) <= starterCore
    && Number(wallet.data?.balance ?? 0) === 0
    && (wishes.count ?? 0) === 0
    && onlyStarterChallenge;
}
