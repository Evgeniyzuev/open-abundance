import { NextRequest, NextResponse } from "next/server";
import { buildAiSystemPrompt } from "@/lib/ai/knowledge";
import { generateAiJson } from "@/lib/ai/providerGateway";
import { buildSafetyPayload, hasSafetyText } from "@/lib/ai/safety";
import { guardAiTool } from "@/lib/ai/toolGuard";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { personName } from "@/lib/personName";
import { createServiceSupabaseClient, getAuthenticatedUser } from "@/lib/serverSupabase";
import { buildTreasuryCoverageReport } from "@/lib/treasuryCoverage";
import {
  OPEN_ENTRIES_MAX,
  callDeadline,
  callMultiplier,
  callView,
  cleanProofText,
  cleanProofUrl,
  multiplierCap,
  normalizeVerdict,
  pickMissions,
  pickText,
  verdictPrompt,
  wordRecord,
  type CallRow,
  type CoverageLight,
  type EntryStatus,
  type Verdict
} from "@/lib/wordCalls";

export const dynamic = "force-dynamic";

// The word_calls tables are newer than lib/database.types.ts, so the client is used untyped here.
type Db = { from: (table: string) => any; rpc: (name: string, args?: Record<string, unknown>) => any };
const serviceDb = () => createServiceSupabaseClient() as unknown as Db;

type EntryRow = {
  id: string; call_id: string; user_id: string; status: EntryStatus; proof_text: string | null; proof_url: string | null;
  ai_verdict: string | null; ai_note: string | null; votes_yes: number; votes_no: number; multiplier: number; reward: number;
  deadline_at: string; created_at: string; submitted_at: string | null; settled_at: string | null;
};
const ENTRY_SELECT = "id,call_id,user_id,status,proof_text,proof_url,ai_verdict,ai_note,votes_yes,votes_no,multiplier,reward,deadline_at,created_at,submitted_at,settled_at";
const CALL_SELECT = "id,key,kind,sphere,title,rule,proof_hint,minutes,difficulty,hours,base_reward";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /word_call/.test(error.message ?? "")));
}

// The reserve light caps the multiplier; it is read at most every 10 minutes per server instance.
let lightCache: { light: CoverageLight; at: number } | null = null;
async function reserveLight(): Promise<CoverageLight> {
  if (lightCache && Date.now() - lightCache.at < 600_000) return lightCache.light;
  try {
    const report = await buildTreasuryCoverageReport(createServiceSupabaseClient() as never);
    lightCache = { light: report.light, at: Date.now() };
  } catch {
    lightCache = { light: "unknown", at: Date.now() };
  }
  return lightCache.light;
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401, headers: NO_STORE_HEADERS });
  const locale = request.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "en";
  const sphere = request.nextUrl.searchParams.get("sphere");
  const db = serviceDb();
  const cap = multiplierCap(await reserveLight());

  const settle = await db.rpc("settle_word_calls", { p_max_multiplier: cap });
  if (missingTable(settle.error)) return NextResponse.json({ available: false }, { headers: NO_STORE_HEADERS });

  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [callsResult, mineResult, settledResult, queueResult, galleryResult, votedResult, profileResult] = await Promise.all([
    db.from("word_calls").select(CALL_SELECT).eq("active", true).order("sort"),
    db.from("word_call_entries").select(ENTRY_SELECT).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    db.from("word_call_entries").select("call_id,status").gt("settled_at", since).in("status", ["kept", "rejected", "broken"]).limit(5000),
    db.from("word_call_entries").select(ENTRY_SELECT).eq("status", "submitted").neq("user_id", user.id).order("submitted_at").limit(40),
    db.from("word_call_entries").select(ENTRY_SELECT).eq("status", "kept").order("settled_at", { ascending: false }).limit(20),
    db.from("word_call_votes").select("entry_id").eq("voter_id", user.id).order("created_at", { ascending: false }).limit(500),
    db.from("user_profiles").select("level").eq("user_id", user.id).maybeSingle()
  ]);
  if (callsResult.error) return NextResponse.json({ error: callsResult.error.message }, { status: 500, headers: NO_STORE_HEADERS });

  const calls = (callsResult.data ?? []) as CallRow[];
  const callById = new Map(calls.map((call) => [call.id, call]));
  const mine = (mineResult.data ?? []) as EntryRow[];
  const takenIds = new Set(mine.map((entry) => entry.call_id));

  const stats = new Map<string, { settled: number; kept: number }>();
  for (const row of (settledResult.data ?? []) as Array<{ call_id: string; status: string }>) {
    const item = stats.get(row.call_id) ?? { settled: 0, kept: 0 };
    item.settled += 1;
    if (row.status === "kept") item.kept += 1;
    stats.set(row.call_id, item);
  }

  const voted = new Set(((votedResult.data ?? []) as Array<{ entry_id: string }>).map((row) => row.entry_id));
  const queueRows = ((queueResult.data ?? []) as EntryRow[]).filter((entry) => !voted.has(entry.id)).slice(0, 5);
  const galleryRows = (galleryResult.data ?? []) as EntryRow[];
  const names = await loadNames(db, [...queueRows, ...galleryRows].map((entry) => entry.user_id));

  const day = new Date().toISOString().slice(0, 10);
  const takenKeys = new Set(mine.map((entry) => callById.get(entry.call_id)?.key).filter((key): key is string => Boolean(key)));
  const missions = pickMissions(calls, sphere, takenKeys, `${day}:${user.id}`).map((call) => callView(call, locale, false));

  const publicEntry = (entry: EntryRow) => {
    const call = callById.get(entry.call_id);
    return {
      id: entry.id,
      name: names.get(entry.user_id) ?? "",
      callTitle: call ? pickText(call.title, locale) : "",
      kind: call?.kind ?? "call",
      proofText: entry.proof_text ?? "",
      proofUrl: entry.proof_url,
      aiNote: entry.ai_note ?? "",
      votes: entry.votes_yes + entry.votes_no,
      multiplier: Number(entry.multiplier),
      reward: Number(entry.reward),
      at: entry.settled_at ?? entry.submitted_at ?? entry.created_at
    };
  };

  return NextResponse.json({
    available: true,
    cap,
    canVote: Number(profileResult.data?.level ?? 0) >= 1,
    record: wordRecord(mine),
    missions,
    calls: calls.filter((call) => call.kind === "call").map((call) => {
      const item = stats.get(call.id) ?? { settled: 0, kept: 0 };
      return { ...callView(call, locale, true), multiplier: callMultiplier(item.settled, item.kept, cap), open: mine.some((entry) => entry.call_id === call.id && (entry.status === "taken" || entry.status === "submitted")) };
    }),
    mine: mine.slice(0, 20).map((entry) => {
      const call = callById.get(entry.call_id);
      return {
        id: entry.id,
        status: entry.status,
        call: call ? callView(call, locale, takenIds.has(call.id)) : null,
        proofText: entry.proof_text ?? "",
        proofUrl: entry.proof_url,
        aiNote: entry.ai_note ?? "",
        votesYes: entry.votes_yes,
        votesNo: entry.votes_no,
        multiplier: Number(entry.multiplier),
        reward: Number(entry.reward),
        deadlineAt: entry.deadline_at
      };
    }),
    queue: queueRows.map(publicEntry),
    gallery: galleryRows.map(publicEntry)
  }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const locale = body?.locale === "ru" ? "ru" : "en";
  if (action === "submit") return submit(request, body ?? {}, locale);

  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401, headers: NO_STORE_HEADERS });
  const db = serviceDb();

  if (action === "take") {
    const callId = typeof body?.callId === "string" ? body.callId : "";
    const { data: call, error } = await db.from("word_calls").select(CALL_SELECT).eq("id", callId).eq("active", true).maybeSingle();
    if (missingTable(error)) return NextResponse.json({ available: false }, { status: 503, headers: NO_STORE_HEADERS });
    if (!call) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE_HEADERS });
    const { count } = await db.from("word_call_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["taken", "submitted"]);
    if ((count ?? 0) >= OPEN_ENTRIES_MAX) return NextResponse.json({ error: "limit" }, { status: 409, headers: NO_STORE_HEADERS });
    const { data: entry, error: insertError } = await db.from("word_call_entries")
      .insert({ call_id: call.id, user_id: user.id, deadline_at: callDeadline((call as CallRow).hours, Date.now()) })
      .select("id").single();
    if (insertError) return NextResponse.json({ error: insertError.code === "23505" ? "already" : insertError.message }, { status: 409, headers: NO_STORE_HEADERS });
    return NextResponse.json({ ok: true, entryId: entry.id, call: callView(call as CallRow, locale, true) }, { headers: NO_STORE_HEADERS });
  }

  if (action === "vote") {
    const entryId = typeof body?.entryId === "string" ? body.entryId : "";
    const { data: profile } = await db.from("user_profiles").select("level").eq("user_id", user.id).maybeSingle();
    if (Number(profile?.level ?? 0) < 1) return NextResponse.json({ error: "level" }, { status: 403, headers: NO_STORE_HEADERS });
    const { data, error } = await db.rpc("vote_word_call", { p_entry_id: entryId, p_voter_id: user.id, p_vote: body?.vote === true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ ok: Boolean(data) }, { headers: NO_STORE_HEADERS });
  }

  if (action === "giveup") {
    const entryId = typeof body?.entryId === "string" ? body.entryId : "";
    const { error } = await db.from("word_call_entries").update({ status: "broken", settled_at: new Date().toISOString() })
      .eq("id", entryId).eq("user_id", user.id).eq("status", "taken");
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE_HEADERS });
}

/** The report: Nova reads it first (a short note for the member and the voters), then the entry waits for votes. */
async function submit(request: NextRequest, body: Record<string, unknown>, locale: "ru" | "en") {
  const proofText = cleanProofText(body.proofText);
  const proofUrl = cleanProofUrl(body.proofUrl);
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  if (proofText.length < 10) return NextResponse.json({ error: "short" }, { status: 400, headers: NO_STORE_HEADERS });
  if (hasSafetyText(proofText)) return NextResponse.json({ safety: buildSafetyPayload(locale) }, { headers: NO_STORE_HEADERS });

  const guard = await guardAiTool(request, "tools.calls");
  if (!guard.ok) return guard.response;
  const db = serviceDb();
  const { data: entry } = await db.from("word_call_entries").select("id,call_id,status,deadline_at").eq("id", entryId).eq("user_id", guard.userId).maybeSingle();
  if (!entry || entry.status !== "taken" || Date.parse(entry.deadline_at) < Date.now()) {
    await guard.refund();
    return NextResponse.json({ error: "closed" }, { status: 409, headers: NO_STORE_HEADERS });
  }
  const { data: call } = await db.from("word_calls").select(CALL_SELECT).eq("id", entry.call_id).maybeSingle();

  let verdict: Verdict = { verdict: "unclear", note: "" };
  try {
    const result = await generateAiJson<Verdict>({
      systemPrompt: buildAiSystemPrompt({ locale, capability: "calls.judge" }),
      userPrompt: verdictPrompt({ title: pickText(call?.title, locale), rule: pickText(call?.rule, locale), proofText, proofUrl, locale }),
      maxOutputTokens: 160,
      validate: (value) => {
        const normalized = normalizeVerdict(value);
        if (!normalized) throw new Error("No verdict.");
        return normalized;
      }
    });
    verdict = result.value;
  } catch {
    // Without Nova's note the members still vote; the AI-only path then cannot keep the word.
    await guard.refund();
  }

  const { error } = await db.from("word_call_entries")
    .update({ status: "submitted", proof_text: proofText, proof_url: proofUrl, ai_verdict: verdict.verdict, ai_note: verdict.note || null, submitted_at: new Date().toISOString() })
    .eq("id", entryId).eq("user_id", guard.userId).eq("status", "taken");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  return NextResponse.json({ ok: true, verdict }, { headers: NO_STORE_HEADERS });
}

async function loadNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map();
  const { data } = await db.from("user_profiles").select("user_id,display_name,username").in("user_id", unique);
  return new Map(((data ?? []) as Array<{ user_id: string; display_name: string | null; username: string | null }>).map((row) => [row.user_id, personName(row, "")]));
}
