import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";
import { attachTelegram } from "@/lib/telegramAccounts";
import { isTelegramOnlyEmail, verifyTelegramInitData } from "@/lib/telegramInitData";

export const dynamic = "force-dynamic";

// "I already have an account" in the Telegram Mini App: the person signed in there by email code, and
// this points their Telegram at that account, so the next Mini App launch opens it directly.
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return json({ error: "Telegram sign-in is not configured." }, 503);
  const { user, error } = await getAuthenticatedUser(request);
  if (error || !user) return json({ error }, 401);
  if (isTelegramOnlyEmail(user.email)) return json({ error: "This account already signs in with Telegram." }, 400);

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
    const attached = await attachTelegram(createServiceSupabaseClient(), verified.user, user.id);
    if (!attached.ok) return json({ error: attached.error, code: attached.code }, attached.status);
    return json({ linked: true });
  } catch (routeError) {
    return json({ error: routeError instanceof Error ? routeError.message : "Linking Telegram failed." }, 500);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
