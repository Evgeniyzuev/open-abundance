import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { APP_INSTALLED_LOGIC } from "@/lib/questPath";
import { getAuthenticatedUser } from "@/lib/serverSupabase";
import { stayRewardedSteps, stayStepReward } from "@/lib/stayInTouch";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenges/stay-in-touch: the «Будем на связи» steps already rewarded (the task shows only the others),
 * and the Core reward of one step.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error }, { status: 401, headers: NO_STORE_HEADERS });
  const db = supabase as any;
  const { data: challenge } = await db.from("challenges").select("id,core_reward_amount").eq("verification_logic", APP_INSTALLED_LOGIC).eq("is_active", true).limit(1).maybeSingle();
  if (!challenge) return NextResponse.json({ rewarded: [], stepReward: 0 }, { headers: NO_STORE_HEADERS });
  const { data: row } = await db.from("user_challenges").select("verification_data").eq("user_id", user.id).eq("challenge_id", challenge.id).maybeSingle();
  return NextResponse.json({ rewarded: stayRewardedSteps(row?.verification_data), stepReward: stayStepReward(Number(challenge.core_reward_amount)) }, { headers: NO_STORE_HEADERS });
}
