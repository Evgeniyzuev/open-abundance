import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { analyticsSalt, pseudonymize } from "@/lib/dailyAnalytics";
import { isGrowthOperator } from "@/lib/growthOperator";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  NOVA_INBOX_COOLDOWN_MS,
  NOVA_INBOX_DEEP_LINK,
  NOVA_INBOX_MAX_RECIPIENTS,
  inboxPushText,
  normalizeInboxBody,
  planInboxSend
} from "@/lib/novaInbox";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUSH_TITLE: Record<string, string> = { ru: "Нова написала вам", en: "Nova wrote to you" };

/**
 * POST /api/internal/nova/inbox { recipients, body, reason?, dryRun? }
 *
 * Puts one personal message from Nova into each recipient's inbox and sends a push that opens the Nova chat.
 * Recipients are pseudonyms from the daily analytics report (`u_…`); a signed-in operator may also pass user ids.
 * Callers: a growth operator, or Claude with NOVA_INBOX_TOKEN after the operator approved the text and the group.
 * Limits: up to NOVA_INBOX_MAX_RECIPIENTS people per call and one message per person every 3 days.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.NOVA_INBOX_TOKEN?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const byToken = Boolean(expected && expected.length >= 32 && safeEqual(provided, expected));
  if (!byToken) {
    const { user, error } = await getAuthenticatedUser(request);
    if (!user) return json({ error: error ?? "Unauthorized." }, 401);
    if (!isGrowthOperator(user.id)) return json({ error: "Not found." }, 404);
  }

  const payload = await request.json().catch(() => null) as { recipients?: unknown; body?: unknown; reason?: unknown; dryRun?: unknown } | null;
  const body = normalizeInboxBody(payload?.body);
  if (!body) return json({ error: "body must be 3 to 800 characters." }, 400);
  const recipients = Array.isArray(payload?.recipients) ? payload.recipients.filter((value): value is string => typeof value === "string").map((value) => value.trim()) : [];
  if (recipients.length === 0 || recipients.length > NOVA_INBOX_MAX_RECIPIENTS) return json({ error: `recipients: 1 to ${NOVA_INBOX_MAX_RECIPIENTS}.` }, 400);
  const reason = typeof payload?.reason === "string" ? payload.reason.slice(0, 120) : null;
  const dryRun = payload?.dryRun === true;

  const salt = analyticsSalt(process.env);
  if (!salt) return json({ error: "Analytics salt is not configured." }, 500);
  const db = createServiceSupabaseClient() as any;
  const now = Date.now();

  const { data: profiles, error: profilesError } = await db.from("user_profiles").select("user_id,default_locale").is("deleted_at", null);
  if (profilesError) return json({ error: profilesError.message }, 500);
  const byPseudonym = new Map<string, string>();
  const locales = new Map<string, string>();
  for (const row of profiles ?? []) {
    byPseudonym.set(pseudonymize(row.user_id, salt), row.user_id);
    locales.set(row.user_id, String(row.default_locale ?? "en"));
  }
  const resolve = (recipient: string) => byPseudonym.get(recipient) ?? (!byToken && UUID.test(recipient) && locales.has(recipient) ? recipient : null);

  const candidateIds = recipients.map(resolve).filter((id): id is string => Boolean(id));
  const lastSentAt = new Map<string, number>();
  if (candidateIds.length) {
    const { data: recent, error: recentError } = await db
      .from("nova_inbox_messages")
      .select("user_id,created_at")
      .in("user_id", candidateIds)
      .gte("created_at", new Date(now - NOVA_INBOX_COOLDOWN_MS).toISOString());
    if (recentError) return json({ error: recentError.message }, 500);
    for (const row of recent ?? []) lastSentAt.set(row.user_id, Math.max(lastSentAt.get(row.user_id) ?? 0, Date.parse(row.created_at)));
  }

  const plan = planInboxSend(recipients, resolve, lastSentAt, now);
  if (dryRun) return json({ dryRun: true, wouldSend: plan.send.map((item) => item.recipient), skipped: plan.skipped }, 200);

  const sent: string[] = [];
  const failed: string[] = [];
  for (const { recipient, userId } of plan.send) {
    const { data: inserted, error: insertError } = await db
      .from("nova_inbox_messages")
      .insert({ user_id: userId, body, source: byToken ? "claude" : "operator", reason })
      .select("id")
      .single();
    if (insertError || !inserted) {
      failed.push(recipient);
      continue;
    }
    const locale = locales.get(userId) === "ru" ? "ru" : "en";
    // The message is already in the inbox; a failed push only means the person sees it next time they open Nova.
    await db.rpc("create_notification_event_raw", {
      p_event_type: "nova.inbox_message",
      p_category: "reminders",
      p_source_type: "nova_inbox",
      p_source_id: inserted.id,
      p_title: PUSH_TITLE[locale],
      p_body: inboxPushText(body),
      p_deep_link: NOVA_INBOX_DEEP_LINK,
      p_recipient_user_ids: [userId],
      p_idempotency_key: `nova_inbox:${inserted.id}`,
      p_metadata: {},
      p_push: true
    });
    sent.push(recipient);
  }
  return json({ sent, failed, skipped: plan.skipped }, 200);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
