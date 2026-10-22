import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { createTelegramLinkToken, isTelegramOnlyEmail } from "@/lib/telegramInitData";
import { telegramMiniAppLink } from "@/lib/telegramMiniAppLink";

export const dynamic = "force-dynamic";

// A one-time link (30 minutes) that opens the Mini App and points this Telegram account at the
// signed-in account, so the person enters the same account from the web and from Telegram.
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request);
  if (error || !user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  if (isTelegramOnlyEmail(user.email)) {
    return NextResponse.json({ error: "This account already signs in with Telegram." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const token = botToken ? createTelegramLinkToken(user.id, botToken) : null;
  const url = token ? telegramMiniAppLink(process.env.TELEGRAM_MINI_APP_URL, token) : null;
  if (!url) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503, headers: NO_STORE_HEADERS });
  return NextResponse.json({ url }, { headers: NO_STORE_HEADERS });
}
