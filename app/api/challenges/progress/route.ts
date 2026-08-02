import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

type ProgressRequest = {
  proofKey?: string;
  score?: number;
  minutesPerDay?: number;
  hourlyValueUsd?: number;
  verificationLogic?: string;
};

const PROGRESS_PROOF_KEYS: Record<string, string[]> = {
  calculate_time_to_goal: ["calculated", "compound_quiz_passed"],
  ai_message_sent: ["ai_message_sent"],
  attention_value_audit: ["attention_audit_completed"],
  core_law_understood: ["core_law_understood"]
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to record challenge progress." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ProgressRequest;
  const allowedProofKeys = body.verificationLogic ? PROGRESS_PROOF_KEYS[body.verificationLogic] : undefined;
  const proofKey = body.proofKey ?? allowedProofKeys?.[0];
  if (!body.verificationLogic || !proofKey) {
    return NextResponse.json({ error: "Unsupported challenge progress." }, { status: 400 });
  }

  if (!allowedProofKeys?.includes(proofKey)) {
    return NextResponse.json({ error: "Unsupported challenge proof." }, { status: 400 });
  }

  const minutesPerDay = normalizeBoundedNumber(body.minutesPerDay, 15, 720);
  const hourlyValueUsd = normalizeBoundedNumber(body.hourlyValueUsd, 1, 1000);
  if (body.verificationLogic === "attention_value_audit" && (minutesPerDay === null || hourlyValueUsd === null)) {
    return NextResponse.json({ error: "Choose valid attention values before saving the scenario." }, { status: 400 });
  }

  if (body.verificationLogic === "core_law_understood" && normalizeScore(body.score) < 4) {
    return NextResponse.json({ error: "Pass at least 4 of 5 Core law questions before saving the result." }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("id")
    .eq("is_active", true)
    .eq("verification_logic", body.verificationLogic)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }

  if (!challenge) {
    return NextResponse.json({ recorded: false, reason: "Challenge not found." });
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_challenges")
    .select("status,verification_data")
    .eq("user_id", user.id)
    .eq("challenge_id", challenge.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (["attention_value_audit", "core_law_understood"].includes(body.verificationLogic) && !["accepted", "completed"].includes(existing?.status ?? "")) {
    return NextResponse.json({ error: "Accept the challenge before recording its proof." }, { status: 409 });
  }

  if (existing?.status === "completed") {
    return NextResponse.json({ recorded: true, status: "completed" });
  }

  const verificationData = {
    ...(isRecord(existing?.verification_data) ? existing.verification_data : {}),
    [proofKey]: true,
    [`${proofKey}_at`]: new Date().toISOString(),
    ...(proofKey === "compound_quiz_passed" ? { compound_quiz_score: normalizeScore(body.score) } : {}),
    ...(body.verificationLogic === "core_law_understood" ? { core_law_score: normalizeScore(body.score) } : {}),
    ...(body.verificationLogic === "attention_value_audit"
      ? { attention_minutes_per_day: minutesPerDay, attention_hourly_value_usd: hourlyValueUsd }
      : {})
  };
  const nextStatus = existing?.status && existing.status !== "declined" ? existing.status : "accepted";

  const { error: upsertError } = await supabase.from("user_challenges").upsert(
    {
      user_id: user.id,
      challenge_id: challenge.id,
      status: nextStatus,
      verification_data: verificationData,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,challenge_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ recorded: true, status: nextStatus });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
}

function normalizeBoundedNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return Math.round(value * 100) / 100;
}
