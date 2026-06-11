import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

type ProgressRequest = {
  proofKey?: string;
  score?: number;
  verificationLogic?: string;
};

const PROGRESS_PROOF_KEYS: Record<string, string[]> = {
  calculate_time_to_goal: ["calculated", "compound_quiz_passed"],
  ai_message_sent: ["ai_message_sent"]
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

  if (existing?.status === "completed") {
    return NextResponse.json({ recorded: true, status: "completed" });
  }

  const verificationData = {
    ...(isRecord(existing?.verification_data) ? existing.verification_data : {}),
    [proofKey]: true,
    [`${proofKey}_at`]: new Date().toISOString(),
    ...(proofKey === "compound_quiz_passed" ? { compound_quiz_score: normalizeScore(body.score) } : {})
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
