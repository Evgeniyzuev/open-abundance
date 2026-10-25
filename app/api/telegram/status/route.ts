import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { telegramBotChatUrl } from "@/lib/telegramMiniAppLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/telegram/status
 *
 * Whether pushes can reach this person in Telegram: `linked` (a Telegram account points at this account) and
 * `canWrite` (the bot may write to them, i.e. they pressed Start or allowed it in the Mini App). Telegram has no
 * read-only check, so a "typing" chat action is sent: it fails the same way a message would.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const botUrl = telegramBotChatUrl(process.env.TELEGRAM_MINI_APP_URL);
  if (!botToken || !botUrl) return json({ configured: false, linked: false, canWrite: false, botUrl: null });

  const { data: account } = await (supabase as any).from("telegram_accounts").select("telegram_id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!account?.telegram_id) return json({ configured: true, linked: false, canWrite: false, botUrl });

  let canWrite = false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: account.telegram_id, action: "typing" })
    });
    canWrite = response.ok;
  } catch {
    canWrite = false;
  }
  return json({ configured: true, linked: true, canWrite, botUrl });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
