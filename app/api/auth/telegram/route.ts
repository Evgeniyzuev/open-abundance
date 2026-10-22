import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";
import { telegramAccountEmail, telegramDisplayName, verifyTelegramInitData } from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

// Sign-in from the Telegram Mini App: the signed initData proves the Telegram account, the server
// makes (or finds) its Supabase user and returns a one-time token the browser exchanges for a session.
// After that the usual registration claim runs (UserProvider, SIGNED_IN), referral included.
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Telegram sign-in is not configured." }, { status: 503, headers: NO_STORE_HEADERS });

  let initData = "";
  try {
    const body = await request.json() as { initData?: unknown };
    initData = typeof body.initData === "string" ? body.initData : "";
  } catch {
    initData = "";
  }
  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) return NextResponse.json({ error: "Invalid Telegram data." }, { status: 401, headers: NO_STORE_HEADERS });

  try {
    const supabase = createServiceSupabaseClient();
    const { user } = verified;
    const email = telegramAccountEmail(user.id);
    const { error: createError } = await supabase.auth.admin.createUser({
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

    const { data, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) throw new Error("Sign-in token was not created.");
    return NextResponse.json({ tokenHash, startParam: verified.startParam }, { headers: NO_STORE_HEADERS });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Telegram sign-in failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
