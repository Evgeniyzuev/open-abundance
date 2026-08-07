import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { recordProductEvent } from "@/lib/serverAnalytics";

type AcceptRequest = {
  challengeId?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to accept the challenge." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AcceptRequest;
  if (!body.challengeId || !isUuid(body.challengeId)) {
    return NextResponse.json({ error: "Invalid challenge." }, { status: 400 });
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
    .select("id,prerequisite_challenge_id")
    .eq("id", body.challengeId)
    .eq("is_active", true)
    .maybeSingle();

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }

  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  if (challenge.prerequisite_challenge_id) {
    const { data: prerequisite, error: prerequisiteError } = await supabase
      .from("user_challenges")
      .select("status")
      .eq("user_id", user.id)
      .eq("challenge_id", challenge.prerequisite_challenge_id)
      .maybeSingle();

    if (prerequisiteError) {
      return NextResponse.json({ error: prerequisiteError.message }, { status: 500 });
    }

    if (prerequisite?.status !== "completed") {
      return NextResponse.json({ error: "Complete the previous challenge in this series first." }, { status: 409 });
    }
  }
  const { data: existing, error: existingError } = await supabase
    .from("user_challenges")
    .select("status")
    .eq("user_id", user.id)
    .eq("challenge_id", challenge.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing?.status === "completed") {
    return NextResponse.json({
      debug: {
        supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
        serverReadAt: new Date().toISOString()
      },
      userId: user.id,
      challengeId: challenge.id,
      status: "completed"
    });
  }

  const { error: upsertError } = await supabase.from("user_challenges").upsert(
    {
      user_id: user.id,
      challenge_id: challenge.id,
      status: "accepted",
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,challenge_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  await recordProductEvent({ entityId: challenge.id, entityType: "challenge", eventName: "challenge_accepted", source: "server", userId: user.id });

  return NextResponse.json({
    debug: {
      supabaseProjectRef: getSupabaseProjectRef(supabaseUrl),
      serverReadAt: new Date().toISOString()
    },
    userId: user.id,
    challengeId: challenge.id,
    status: "accepted"
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
