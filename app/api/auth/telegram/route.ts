import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import {
  isTelegramOnlyEmail,
  readTelegramLinkToken,
  telegramAccountEmail,
  telegramDisplayName,
  verifyTelegramInitData,
  type TelegramUser
} from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createServiceSupabaseClient>;

// Sign-in from the Telegram Mini App: the signed initData proves the Telegram account, the server finds
// the account it points to (telegram_accounts), or makes a new one, and returns a one-time token the
// browser exchanges for a session. After that the usual registration claim runs (UserProvider, SIGNED_IN).
// With a link token from the profile (startapp=lnk_...) the Telegram account is pointed at that existing
// account instead, so the person keeps one account for the web and Telegram.
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return json({ error: "Telegram sign-in is not configured." }, 503);

  let initData = "";
  try {
    const body = await request.json() as { initData?: unknown };
    initData = typeof body.initData === "string" ? body.initData : "";
  } catch {
    initData = "";
  }
  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) return json({ error: "Invalid Telegram data." }, 401);

  try {
    const supabase = createServiceSupabaseClient();
    const { user } = verified;
    const mapping = await readMapping(supabase, user.id);
    const linkUserId = readTelegramLinkToken(verified.startParam, botToken);

    if (linkUserId) {
      if (!mapping.ready) return json({ error: "Linking Telegram is not available yet.", code: "link_unavailable" }, 503);
      const target = await accountEmail(supabase, linkUserId);
      if (!target) return json({ error: "Account not found.", code: "link_account_missing" }, 404);
      if (mapping.userId && mapping.userId !== linkUserId) {
        const current = await accountEmail(supabase, mapping.userId);
        // Only an empty account made from Telegram is let go; real accounts are never merged silently.
        if (current && !isTelegramOnlyEmail(current)) return json({ error: "This Telegram is linked to another account.", code: "telegram_linked_elsewhere" }, 409);
        if (current && !(await isEmptyAccount(supabase, mapping.userId))) return json({ error: "This Telegram already has its own account with data.", code: "telegram_account_has_data" }, 409);
      }
      await saveMapping(supabase, user, linkUserId);
      return json({ tokenHash: await signInToken(supabase, target), linked: true });
    }

    if (mapping.userId) {
      const email = await accountEmail(supabase, mapping.userId);
      if (email) return json({ tokenHash: await signInToken(supabase, email), startParam: verified.startParam });
    }

    const email = telegramAccountEmail(user.id);
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        telegram_id: user.id,
        telegram_username: user.username,
        full_name: telegramDisplayName(user),
        given_name: user.firstName,
        family_name: user.lastName,
        avatar_url: user.photoUrl
      }
    });
    // An existing account for this Telegram id is fine: it signs in below.
    if (createError && !/already|exists|registered/i.test(createError.message)) throw createError;
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const userId = created?.user?.id ?? link.user?.id;
    if (mapping.ready && userId) await saveMapping(supabase, user, userId);
    const tokenHash = link.properties?.hashed_token;
    if (!tokenHash) throw new Error("Sign-in token was not created.");
    return json({ tokenHash, startParam: verified.startParam });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Telegram sign-in failed." }, 500);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** `ready` is false until the telegram_accounts migration is applied; sign-in then works as before, without links. */
async function readMapping(supabase: Db, telegramId: number): Promise<{ ready: boolean; userId: string | null }> {
  const { data, error } = await (supabase as any).from("telegram_accounts").select("user_id").eq("telegram_id", telegramId).maybeSingle();
  if (error) return { ready: false, userId: null };
  return { ready: true, userId: data?.user_id ?? null };
}

async function saveMapping(supabase: Db, user: TelegramUser, userId: string): Promise<void> {
  const { error } = await (supabase as any).from("telegram_accounts").upsert({
    telegram_id: user.id,
    user_id: userId,
    telegram_username: user.username,
    updated_at: new Date().toISOString()
  }, { onConflict: "telegram_id" });
  if (error) throw error;
}

async function accountEmail(supabase: Db, userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

async function signInToken(supabase: Db, email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Sign-in token was not created.");
  return tokenHash;
}

/** Nothing to lose: no Core or Wallet balance and no wishes. */
async function isEmptyAccount(supabase: Db, userId: string): Promise<boolean> {
  const [core, wallet, wishes] = await Promise.all([
    supabase.from("core_accounts").select("balance").eq("user_id", userId).maybeSingle(),
    supabase.from("wallet_accounts").select("balance").eq("user_id", userId).maybeSingle(),
    supabase.from("wishes").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).is("deleted_at", null)
  ]);
  if (core.error || wallet.error || wishes.error) return false;
  return Number(core.data?.balance ?? 0) === 0 && Number(wallet.data?.balance ?? 0) === 0 && (wishes.count ?? 0) === 0;
}
