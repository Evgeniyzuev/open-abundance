import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { normalizeLocale } from "@/lib/i18n";
import { recordProductEvent } from "@/lib/serverAnalytics";
import { looksLikeEmail, usernameBase, usernameCandidates } from "@/lib/username";

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
  // The public name is never taken from the email. Without a name it stays empty here and is
  // filled with the generated nickname below.
  const providerName = fullName ?? (googleName || null);
  const providerAvatarUrl = textMetadata(user.user_metadata.avatar_url) ?? textMetadata(user.user_metadata.picture);
  const now = new Date().toISOString();
  const anonymousId = cleanAttribution(body.anonymousId);
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("user_profiles")
    .select("default_locale,onboarding_state,display_name,username,first_name,last_name,avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }

  const isNewRegistration = !existingProfile;

  // Sign-in must not overwrite what the person set themselves (name, avatar); it only fills gaps.
  // A stored name that looks like an email counts as missing so it is replaced and never shown.
  const storedName = existingProfile?.display_name && !looksLikeEmail(existingProfile.display_name) ? existingProfile.display_name : null;
  const displayName = storedName ?? providerName;
  const avatarUrl = existingProfile?.avatar_url ?? providerAvatarUrl ?? null;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      first_name: existingProfile?.first_name ?? givenName ?? null,
      last_name: existingProfile?.last_name ?? familyName ?? null,
      display_name: displayName,
      avatar_url: avatarUrl,
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

  // Every profile gets a nickname generated from the person's name. When there is no real name,
  // the nickname also becomes the public display name.
  if (!existingProfile?.username) {
    const claimed = await claimGeneratedUsername(supabase, user.id, {
      firstName: existingProfile?.first_name ?? givenName,
      lastName: existingProfile?.last_name ?? familyName,
      displayName
    });
    if (claimed && !displayName) {
      await supabase.from("user_profiles").update({ display_name: claimed }).eq("user_id", user.id).is("display_name", null);
    }
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

  if (anonymousId) {
    await supabase
      .from("product_events")
      .update({ user_id: user.id })
      .eq("anonymous_id", anonymousId)
      .is("user_id", null);
  }

  const registrationReward = await grantRegistrationReward(supabase, user.id);
  if (registrationReward.error) {
    return NextResponse.json({ error: registrationReward.error }, { status: 500 });
  }

  if (isNewRegistration) {
    await recordProductEvent({
      anonymousId,
      eventName: "registration_completed",
      source: "server",
      userId: user.id,
      properties: {
        acquisition_source: cleanAttribution(body.acquisitionSource) ?? (body.referralCode ? "referral" : "direct"),
        acquisition_medium: cleanAttribution(body.acquisitionMedium),
        campaign: cleanAttribution(body.campaign),
        cohort_id: cleanAttribution(body.cohortId),
        has_referral: Boolean(cleanAttribution(body.referralCode))
      }
    });
  }

  return NextResponse.json({
    registrationReward: {
      coreAmount: registrationReward.coreAmount,
      walletAmount: registrationReward.walletAmount,
      coreBalanceAfter: registrationReward.coreBalanceAfter,
      walletBalanceAfter: registrationReward.walletBalanceAfter,
      claimed: registrationReward.claimed
    },
    userId: user.id
  });
}

async function grantRegistrationReward(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
): Promise<{ coreAmount: number; walletAmount: number; coreBalanceAfter: number | null; walletBalanceAfter: number | null; claimed: boolean; error?: string }> {
  const { data: challenge, error: challengeError } = await supabase
    .from("challenges")
    .select("id,core_reward_amount,wallet_reward_amount")
    .eq("verification_logic", "signup")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const emptyReward = { coreAmount: 0, walletAmount: 0, coreBalanceAfter: null, walletBalanceAfter: null, claimed: false };
  if (challengeError) return { ...emptyReward, error: challengeError.message };
  if (!challenge) return emptyReward;

  const { data: completionRows, error: completionError } = await supabase.rpc("settle_user_challenge_rewards", {
    p_user_id: userId,
    p_challenge_id: challenge.id
  });

  if (completionError) return { ...emptyReward, error: completionError.message };

  const [{ data: core, error: coreError }, { data: wallet, error: walletError }] = await Promise.all([
    supabase.from("core_accounts").select("balance").eq("user_id", userId).single(),
    supabase.from("wallet_accounts").select("balance").eq("user_id", userId).single()
  ]);

  if (coreError) return { ...emptyReward, error: coreError.message };
  if (walletError) return { ...emptyReward, error: walletError.message };

  const [completion] = completionRows ?? [];
  return {
    coreAmount: Number(completion?.rewarded_core_amount ?? challenge.core_reward_amount),
    walletAmount: Number(completion?.rewarded_wallet_amount ?? challenge.wallet_reward_amount),
    coreBalanceAfter: Number(core.balance),
    walletBalanceAfter: Number(wallet.balance),
    claimed: Boolean(completion?.reward_claimed)
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readJsonBody(request: NextRequest): Promise<{
  defaultLocale?: unknown;
  anonymousId?: unknown;
  acquisitionSource?: unknown;
  acquisitionMedium?: unknown;
  campaign?: unknown;
  cohortId?: unknown;
  referralCode?: unknown;
}> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function cleanAttribution(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 100) : undefined;
}

/** Tries generated nicknames until one is free; returns the claimed nickname or null. */
async function claimGeneratedUsername(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  source: { firstName?: string | null; lastName?: string | null; displayName?: string | null }
): Promise<string | null> {
  for (const candidate of usernameCandidates(usernameBase(source))) {
    const { data, error } = await (supabase as any).rpc("claim_username", { p_user_id: userId, p_username: candidate, p_source: "registration" });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.result_code === "ok" || row?.result_code === "unchanged") return row.new_username as string;
  }
  return null;
}
