import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PendingReferral } from "@/lib/guestIdentity";
import { detectBrowserLocale, normalizeLocale, type AppLocale } from "@/lib/i18n";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bsikxrsguwketlloflgi.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0] ?? "open-abundance";

export const POST_AUTH_REWARD_STORAGE_KEY = "openAbundancePostAuthReward";
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export type AuthMethod = "google" | "email";

export type RegistrationReward = {
  account: "core" | "wallet";
  amount: number;
  balanceAfter: number | null;
  claimed: boolean;
};

export type RegistrationClaimResult = {
  registrationReward: RegistrationReward;
  userId: string;
};

let browserClient: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  browserClient ??= createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SUPABASE_AUTH_STORAGE_KEY
    }
  });

  return browserClient;
}

export function clearBrowserSupabaseSession(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    window.localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
  } catch {
    // A reload still gives the browser another chance to recover inaccessible storage.
  }

  try {
    window.sessionStorage.removeItem(POST_AUTH_REWARD_STORAGE_KEY);
  } catch {
    // The reward notice is non-critical when session storage is unavailable.
  }

  browserClient = undefined;
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getAuthCallbackUrl("google") }
  });

  if (error) throw error;
}

export async function requestEmailOtp(email: string): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true
    }
  });

  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email"
  });

  if (error) throw error;
}

function getAuthCallbackUrl(method: AuthMethod): string {
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  callbackUrl.searchParams.set("method", method);
  return callbackUrl.toString();
}

export async function claimRegistrationAfterAuth(locale: AppLocale = detectBrowserLocale()): Promise<RegistrationClaimResult> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("Supabase session is missing.");

  const response = await fetch("/api/auth/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ defaultLocale: normalizeLocale(locale) })
  });

  const payload = (await response.json()) as Partial<RegistrationClaimResult> & { error?: string };
  if (!response.ok || !payload.userId || !payload.registrationReward) {
    throw new Error(payload.error ?? "Failed to claim guest identity.");
  }

  return {
    registrationReward: payload.registrationReward,
    userId: payload.userId
  };
}

export function storePostAuthReward(reward: RegistrationReward): void {
  if (typeof window === "undefined" || !reward.claimed) return;
  window.sessionStorage.setItem(POST_AUTH_REWARD_STORAGE_KEY, JSON.stringify(reward));
}

export function consumePostAuthReward(): RegistrationReward | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(POST_AUTH_REWARD_STORAGE_KEY);
    window.sessionStorage.removeItem(POST_AUTH_REWARD_STORAGE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<RegistrationReward>;
    if (!value.claimed || (value.account !== "core" && value.account !== "wallet") || typeof value.amount !== "number") {
      return null;
    }
    return {
      account: value.account,
      amount: value.amount,
      balanceAfter: typeof value.balanceAfter === "number" ? value.balanceAfter : null,
      claimed: true
    };
  } catch {
    return null;
  }
}

export async function claimReferralAfterAuth(
  pendingReferral: PendingReferral | undefined,
  guestId: string
): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token) throw new Error("Supabase session is missing.");

  const response = await fetch("/api/referrals/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      referralCode: pendingReferral?.referralCode,
      guestId,
      capturedAt: pendingReferral?.capturedAt
    })
  });

  const payload = (await response.json()) as { error?: string };
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? "Failed to claim referral.");
  }
}
