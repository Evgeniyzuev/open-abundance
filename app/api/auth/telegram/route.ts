import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { accountEmail, attachTelegram, readTelegramMapping, saveTelegramMapping, signInToken } from "@/lib/telegramAccounts";
import { readTelegramLinkToken, telegramAccountEmail, telegramDisplayName, verifyTelegramInitData } from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

// Sign-in from the Telegram Mini App: the signed initData proves the Telegram account and the server
// returns a one-time token the browser exchanges for a session; the usual registration claim follows.
// - A Telegram account already pointed at an account (telegram_accounts) signs in to it.
// - A new Telegram account gets { needsChoice } first: "continue as <name>" sends mode "create" and makes
//   an account in one tap; "I already have an account" signs in by email and calls ./attach.
// - A link token from the profile (startapp=lnk_...) points this Telegram at that existing account.
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return json({ error: "Telegram sign-in is not configured." }, 503);

  let initData = "";
  let mode = "";
  try {
    const body = await request.json() as { initData?: unknown; mode?: unknown };
    initData = typeof body.initData === "string" ? body.initData : "";
    mode = body.mode === "create" ? "create" : "";
  } catch {
    initData = "";
  }
  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) return json({ error: "Invalid Telegram data." }, 401);

  try {
    const supabase = createServiceSupabaseClient();
    const { user } = verified;
    const linkUserId = readTelegramLinkToken(verified.startParam, botToken);

    if (linkUserId) {
      const target = await accountEmail(supabase, linkUserId);
      if (!target) return json({ error: "Account not found.", code: "link_account_missing" }, 404);
      const attached = await attachTelegram(supabase, user, linkUserId);
      if (!attached.ok) return json({ error: attached.error, code: attached.code }, attached.status);
      return json({ tokenHash: await signInToken(supabase, target), linked: true });
    }

    const mapping = await readTelegramMapping(supabase, user.id);
    if (mapping.userId) {
      const email = await accountEmail(supabase, mapping.userId);
      if (email) return json({ tokenHash: await signInToken(supabase, email), startParam: verified.startParam });
    }

    // Before the migration there is no way to tell a new Telegram account from a returning one: keep the one-tap entry.
    if (mapping.ready && mode !== "create") {
      return json({ needsChoice: true, firstName: user.firstName ?? user.username ?? null });
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
    if (mapping.ready && userId) await saveTelegramMapping(supabase, user, userId);
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
