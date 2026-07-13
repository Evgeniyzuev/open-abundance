import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { recordProductEvent } from "@/lib/serverAnalytics";

type GiveUpRequest = {
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
    return NextResponse.json({ error: "Sign in to give up the challenge." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GiveUpRequest;
  if (!body.challengeId || !isUuid(body.challengeId)) {
    return NextResponse.json({ error: "Invalid challenge." }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
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
    .eq("id", body.challengeId)
    .eq("is_active", true)
    .maybeSingle();

  if (challengeError) return NextResponse.json({ error: challengeError.message }, { status: 500 });
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });

  const { data: existing, error: existingError } = await supabase
    .from("user_challenges")
    .select("status")
    .eq("user_id", user.id)
    .eq("challenge_id", challenge.id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing || existing.status === "declined") {
    return NextResponse.json({ userId: user.id, challengeId: challenge.id, status: "declined" });
  }

  if (existing.status === "completed") {
    return NextResponse.json({ error: "Completed challenges cannot be given up." }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("user_challenges")
    .update({
      status: "declined",
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .eq("challenge_id", challenge.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await recordProductEvent({ entityId: challenge.id, entityType: "challenge", eventName: "challenge_given_up", source: "server", userId: user.id });

  return NextResponse.json({ userId: user.id, challengeId: challenge.id, status: "declined" });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
