import { NextRequest, NextResponse } from "next/server";
import { CHANNEL_CODE_CHALLENGES, CHANNEL_CODE_EVENT, CHANNEL_CODE_TEXT, isChannelCodeLogic, type CodeChannel } from "@/lib/channelCodes";
import { APP_INSTALLED_LOGIC } from "@/lib/questPath";
import { channelCode } from "@/lib/channelCodesServer";
import { SITE_URL } from "@/lib/guideLocales";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { NOVA_INBOX_DEEP_LINK } from "@/lib/novaInbox";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegramBot";
import { telegramBotChatUrl } from "@/lib/telegramMiniAppLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * POST /api/challenges/channel-code { challengeId, standalone? }
 *
 * Sends today's code of a "get a code" challenge (lib/channelCodes.ts) through its own channel: the Telegram bot, a
 * web push to the person's devices, or a message at the top of the Nova chat. The challenge must be accepted.
 */
export async function POST(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return json({ error }, 401);
  const db = supabase as any;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return json({ error: "Not configured." }, 500);

  const body = (await request.json().catch(() => null)) as { challengeId?: unknown; standalone?: unknown } | null;
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  const { data: challenge } = await db.from("challenges").select("id,verification_logic").eq("id", challengeId).eq("is_active", true).maybeSingle();
  // "Install the app" is a push code asked from the app opened from the home screen (or a computer browser, where the
  // install is optional); the others have one channel each.
  const installQuest = challenge?.verification_logic === APP_INSTALLED_LOGIC;
  if (!challenge || (!installQuest && !isChannelCodeLogic(challenge.verification_logic))) return json({ error: "Challenge not found." }, 404);
  if (installQuest && body?.standalone !== true) return json({ error: "Open the installed app from the home screen.", code: "not_installed" }, 409);
  const { data: accepted } = await db.from("user_challenges").select("status").eq("user_id", user.id).eq("challenge_id", challenge.id).maybeSingle();
  if (accepted?.status !== "accepted") return json({ error: "Accept the challenge first.", code: "not_accepted" }, 409);

  const channel: CodeChannel = installQuest
    ? "push"
    : CHANNEL_CODE_CHALLENGES[challenge.verification_logic as keyof typeof CHANNEL_CODE_CHALLENGES];
  const now = Date.now();
  const code = channelCode(secret, user.id, channel, now);
  const { data: profile } = await db.from("user_profiles").select("default_locale").eq("user_id", user.id).maybeSingle();
  const lang = profile?.default_locale === "ru" ? "ru" : "en";
  const copy = CHANNEL_CODE_TEXT[lang];

  if (channel === "telegram") {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const botUrl = telegramBotChatUrl(process.env.TELEGRAM_MINI_APP_URL);
    const { data: account } = await db.from("telegram_accounts").select("telegram_id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!botToken) return json({ error: "Telegram is not configured." }, 503);
    if (!account?.telegram_id) return json({ error: "Link Telegram first.", code: "telegram_not_linked", botUrl }, 409);
    const result = await sendTelegramMessage(botToken, account.telegram_id, {
      text: `<b>${escapeTelegramHtml(copy.title)}</b>\n\n${escapeTelegramHtml(copy.body(code))}`,
      buttonText: lang === "ru" ? "Открыть челленджи" : "Open challenges",
      url: `${SITE_URL.replace(/\/+$/, "")}/?view=challenges`,
      html: true
    });
    if (!result.ok) return json({ error: result.error, code: result.blocked ? "bot_not_started" : "send_failed", botUrl }, result.blocked ? 409 : 502);
    return json({ sent: true, channel });
  }

  if (channel === "push") {
    const { data: devices } = await db.from("push_subscriptions").select("id").eq("owner_key", `user:${user.id}`).eq("enabled", true);
    if (!devices?.length) return json({ error: "Turn on push notifications on this device first.", code: "no_push_device" }, 409);
    // One push per 10 minutes: a repeated tap inside the window reuses the event, and its deliveries already exist.
    const bucket = Math.floor(now / 600_000);
    const { data: eventId, error: eventError } = await db.rpc("create_notification_event_raw", {
      p_event_type: CHANNEL_CODE_EVENT,
      p_category: "system",
      p_source_type: "challenge",
      p_source_id: challenge.id,
      p_title: copy.title,
      p_body: copy.body(code),
      p_deep_link: "/?view=challenges",
      p_recipient_user_ids: [user.id],
      p_idempotency_key: `channel_code:${user.id}:${bucket}`,
      p_metadata: { copy: { [lang]: { title: copy.title, body: copy.body(code) } } },
      // Not p_push: that would also copy the code to Telegram. Deliveries go to web push devices only.
      p_push: false
    });
    if (eventError || !eventId) return json({ error: "Could not send the push." }, 500);
    const { data: recipient } = await db.from("notification_recipients").select("id").eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
    if (!recipient) return json({ error: "Could not send the push." }, 500);
    // Read at once and hidden from the in-app list (app/api/notifications), so the code is only in the push.
    await db.from("notification_recipients").update({ read_at: new Date().toISOString() }).eq("id", recipient.id);
    const { error: deliveryError } = await db.from("notification_deliveries").upsert(
      devices.map((device: { id: string }) => ({ recipient_id: recipient.id, subscription_id: device.id })),
      { onConflict: "recipient_id,subscription_id", ignoreDuplicates: true }
    );
    if (deliveryError) return json({ error: "Could not send the push." }, 500);
    return json({ sent: true, channel });
  }

  // Nova: one waiting message is enough; the code is the same all day.
  const { data: waiting } = await db.from("nova_inbox_messages").select("id").eq("user_id", user.id).eq("source", "system").is("delivered_at", null).limit(1);
  if (!waiting?.length) {
    const { error: insertError } = await db.from("nova_inbox_messages").insert({ user_id: user.id, body: copy.body(code), source: "system", reason: "channel_code" });
    if (insertError) return json({ error: "Could not send the message." }, 500);
  }
  return json({ sent: true, channel, deepLink: NOVA_INBOX_DEEP_LINK });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
