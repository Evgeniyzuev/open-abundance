"use client";

import { useEffect, useRef, useState } from "react";
import {
  claimReferralAfterAuth,
  claimRegistrationAfterAuth,
  getBrowserSupabaseClient,
  signInWithGoogle,
  storePostAuthReward
} from "@/lib/supabaseClient";
import { getOrCreateLocalGuest, markLocalGuestClaimed, markPendingReferralClaimed } from "@/lib/guestIdentity";
import { translate, type AppLocale } from "@/lib/i18n";
import { getOnboardingRegistrationLocale } from "@/lib/onboardingContent";
import { trackProductEvent } from "@/lib/productAnalytics";

export default function AuthCallbackPage() {
  const [locale, setLocale] = useState<AppLocale>("en");
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const registrationLocale = getOnboardingRegistrationLocale();
    setLocale(registrationLocale);

    async function completeAuth() {
      const supabase = getBrowserSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error_description") ?? params.get("error");
      const code = params.get("code");

      if (oauthError) throw new Error(oauthError);

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      const guest = await getOrCreateLocalGuest();
      const claim = await claimRegistrationAfterAuth(registrationLocale);
      await markLocalGuestClaimed(claim.userId);
      await claimReferralAfterAuth(guest.pendingReferral, guest.guestId);
      await markPendingReferralClaimed();
      trackProductEvent("onboarding_completed", { path: "google", version: "abundance_mission_v3" });

      if (claim.registrationReward.claimed) {
        storePostAuthReward(claim.registrationReward);
        window.location.replace("/?view=people&auth=complete");
        return;
      }

      window.location.replace("/?view=people");
    }

    completeAuth().catch((error) => {
      console.error(error);
      setStatus("error");
    });
  }, []);

  async function retrySignIn() {
    setStatus("loading");
    try {
      trackProductEvent("onboarding_auth_started", { retry: true, version: "abundance_mission_v3" });
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  return (
    <main className="auth-callback-screen">
      <section>
        <strong>{status === "loading" ? translate(locale, "auth.callback.finishing") : translate(locale, "auth.callback.error")}</strong>
        {status === "error" ? (
          <div className="auth-callback-actions">
            <button className="challenge-primary-action" type="button" onClick={() => void retrySignIn()}>
              {translate(locale, "auth.callback.retry")}
            </button>
            <button className="challenge-secondary-action" type="button" onClick={() => window.location.replace("/")}>
              {translate(locale, "auth.callback.back")}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
