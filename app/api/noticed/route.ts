import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import { AiGatewayError, generateAiJson } from "@/lib/ai/providerGateway";
import { buildSafetyPayload, hasSafetyText } from "@/lib/ai/safety";
import { guardAiTool } from "@/lib/ai/toolGuard";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { cleanNoticedText, cleanTimes, normalizeNoticedPlan, noticedPrompt, type NoticedEntry, type NoticedPlan } from "@/lib/noticed";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";

export const dynamic = "force-dynamic";

type Row = { id: string; text: string; reply: string | null; action: string | null; push_title: string | null; push_body: string | null; times: string[] | null; weekdays_only: boolean; reminders_on: boolean; created_at: string };

// noticed_entries is newer than lib/database.types.ts, so the client is used untyped here.
type Db = { from: (table: string) => any };
const serviceDb = () => createServiceSupabaseClient() as unknown as Db;

const SELECT = "id,text,reply,action,push_title,push_body,times,weekdays_only,reminders_on,created_at";

function toEntry(row: Row): NoticedEntry {
  return {
    id: row.id,
    text: row.text,
    reply: row.reply ?? "",
    action: row.action ?? "",
    pushTitle: row.push_title ?? "",
    pushBody: row.push_body ?? "",
    times: row.times ?? [],
    weekdaysOnly: row.weekdays_only,
    remindersOn: row.reminders_on,
    createdAt: row.created_at
  };
}

// Before the migration is applied the card simply stays hidden.
function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /noticed_entries/.test(error.message ?? "")));
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401, headers: NO_STORE_HEADERS });
  const db = serviceDb();
  const { data, error } = await db.from("noticed_entries").select(SELECT).eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(20);
  if (missingTable(error)) return NextResponse.json({ available: false, entries: [] }, { headers: NO_STORE_HEADERS });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ available: true, entries: ((data ?? []) as Row[]).map(toEntry) }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { text?: unknown; locale?: unknown; timezone?: unknown } | null;
  const locale = body?.locale === "en" ? "en" : "ru";
  const text = cleanNoticedText(body?.text);
  if (!text) return NextResponse.json({ error: "Empty." }, { status: 400, headers: NO_STORE_HEADERS });
  if (hasSafetyText(text)) return NextResponse.json({ safety: buildSafetyPayload(locale) }, { headers: NO_STORE_HEADERS });
  const timezone = typeof body?.timezone === "string" && body.timezone.length <= 100 ? body.timezone : "UTC";

  const guard = await guardAiTool(request, "tools.noticed");
  if (!guard.ok) return guard.response;
  const db = serviceDb();
  const { data: recentRows, error: recentError } = await db.from("noticed_entries").select("text").eq("user_id", guard.userId).order("created_at", { ascending: false }).limit(5);
  if (missingTable(recentError)) {
    await guard.refund();
    return NextResponse.json({ available: false }, { status: 503, headers: NO_STORE_HEADERS });
  }

  let plan: NoticedPlan;
  try {
    const result = await generateAiJson<NoticedPlan>({
      systemPrompt: buildAiSystemPrompt({ locale, capability: "noticed.coach" }),
      userPrompt: noticedPrompt(text, locale, ((recentRows ?? []) as Array<{ text: string }>).map((row) => row.text)),
      maxOutputTokens: 300,
      validate: (value) => {
        const normalized = normalizeNoticedPlan(value);
        if (!normalized) throw new Error("No usable plan.");
        return normalized;
      }
    });
    plan = result.value;
  } catch (error) {
    await guard.refund();
    const status = error instanceof AiGatewayError && error.code === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: "AI could not answer." }, { status, headers: NO_STORE_HEADERS });
  }

  const { data, error } = await db.from("noticed_entries").insert({
    user_id: guard.userId,
    text,
    reply: plan.reply,
    action: plan.action,
    push_title: plan.pushTitle,
    push_body: plan.pushBody,
    times: plan.times,
    weekdays_only: plan.weekdaysOnly,
    timezone,
    locale
  }).select(SELECT).single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not saved." }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ entry: toEntry(data as Row) }, { headers: NO_STORE_HEADERS });
}

/** Turn reminders on/off, change the times, or mark the entry done / remove it. */
export async function PATCH(request: NextRequest) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401, headers: NO_STORE_HEADERS });
  const body = (await request.json().catch(() => null)) as { id?: unknown; remindersOn?: unknown; times?: unknown; status?: unknown; timezone?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400, headers: NO_STORE_HEADERS });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.remindersOn === "boolean") patch.reminders_on = body.remindersOn;
  if (body?.times !== undefined) patch.times = cleanTimes(body.times);
  if (body?.status === "done" || body?.status === "archived") patch.status = body.status;
  if (typeof body?.timezone === "string" && body.timezone.length <= 100) patch.timezone = body.timezone;
  const db = serviceDb();
  const { data, error } = await db.from("noticed_entries").update(patch).eq("id", id).eq("user_id", user.id).select(SELECT).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
  return NextResponse.json({ entry: toEntry(data as Row) }, { headers: NO_STORE_HEADERS });
}
