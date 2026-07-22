import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { normalizeLocale } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.replace(/^Bearer\s+/i, "");
  const body = await readJsonBody(request);
  const defaultLocale = normalizeLocale(body.defaultLocale);

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server environment variables are missing." }, { status: 500 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Missing Supabase access token." }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid Supabase access token." }, { status: 401 });
  }

  const fullName = textMetadata(user.user_metadata.full_name) ?? textMetadata(user.user_metadata.name);
  const givenName = textMetadata(user.user_metadata.given_name);
  const familyName = textMetadata(user.user_metadata.family_name);
  const googleName = [givenName, familyName].filter(Boolean).join(" ");
  const displayName = fullName ?? (googleName || user.email || null);
  const avatarUrl = textMetadata(user.user_metadata.avatar_url) ?? textMetadata(user.user_metadata.picture);
  const now = new Date().toISOString();
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("user_profiles")
    .select("default_locale,onboarding_state")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      username: textMetadata(user.user_metadata.user_name) ?? null,
      first_name: givenName ?? null,
      last_name: familyName ?? null,
      display_name: displayName,
      avatar_url: avatarUrl ?? null,
      default_locale: normalizeLocale(existingProfile?.default_locale ?? defaultLocale),
      onboarding_state: {
        ...readObject(existingProfile?.onboarding_state),
        firstExperienceCompleted: true,
        registrationChallenge: "completed"
      },
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: coreError } = await supabase.from("core_accounts").upsert(
    {
      user_id: user.id,
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (coreError) {
    return NextResponse.json({ error: coreError.message }, { status: 500 });
  }

  const { error: walletError } = await supabase.from("wallet_accounts").upsert(
    {
      user_id: user.id,
      updated_at: now
    },
    { onConflict: "user_id" }
  );

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  const registrationReward = await grantRegistrationReward(supabase, user.id);
  if (registrationReward.error) {
    return NextResponse.json({ error: registrationReward.error }, { status: 500 });
  }

  return NextResponse.json({
    registrationReward: {
      account: registrationReward.account,
      amount: registrationReward.amount,
      balanceAfter: registrationReward.balanceAfter,
      claimed: registrationReward.claimed
    },
    userId: user.id
  });
}

async function grantRegistrationReward(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
): Promise<{ account: "core"; amount: number; balanceAfter: number | null; claimed: boolean; error?: string }> {
  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("id,reward_label")
    .eq("verification_logic", "signup")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const emptyReward = { account: "core" as const, amount: 0, balanceAfter: null, claimed: false };
  if (challengeError) return { ...emptyReward, error: challengeError.message };
  if (!challenge) return emptyReward;

  const rewardAmount = getRewardAmount(challenge.reward_label);

  const { data: completionRows, error: completionError } = await supabase.rpc("complete_user_challenge", {
    p_user_id: userId,
    p_challenge_id: challenge.id,
    p_reward_account: "core",
    p_reward_amount: rewardAmount
  });

  if (completionError) return { ...emptyReward, amount: rewardAmount, error: completionError.message };

  const { data: core, error: coreError } = await supabase
    .from("core_accounts")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (coreError) return { ...emptyReward, amount: rewardAmount, error: coreError.message };

  const [completion] = completionRows ?? [];
  return {
    account: "core",
    amount: Number(completion?.rewarded_amount ?? rewardAmount),
    balanceAfter: Number(core.balance),
    claimed: Boolean(completion?.reward_claimed)
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getRewardAmount(value: Database["public"]["Tables"]["challenges"]["Row"]["reward_label"]): number {
  const raw = rewardLabelText(value);
  const amount = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/)?.[1] ?? raw.match(/\+(\d+(?:[.,]\d+)?)/)?.[1] ?? raw.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  return amount ? Number(amount.replace(",", ".")) : 1;
}

function rewardLabelText(value: Database["public"]["Tables"]["challenges"]["Row"]["reward_label"]): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const en = record.en;
    const ru = record.ru;
    if (typeof en === "string") return en;
    if (typeof ru === "string") return ru;
  }

  return "2$";
}

async function readJsonBody(request: NextRequest): Promise<{ defaultLocale?: unknown }> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
