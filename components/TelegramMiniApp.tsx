"use client";

import { useEffect } from "react";
import { rememberAcquisitionSource } from "@/lib/acquisition";
import { capturePendingReferral, isValidReferralCode } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

const TELEGRAM_SCRIPT = "https://telegram.org/js/telegram-web-app.js";
// Start parameter of a one-time "link Telegram to my account" link from the profile (lib/telegramInitData.ts).
const LINK_PREFIX = "lnk_";

type TelegramWebApp = { initData?: string; ready?: () => void; expand?: () => void };

/**
 * An extra entry: the app opened as a Telegram Mini App (t.me/<bot>/<app>?startapp=<referral code>).
 * Telegram passes signed data in the URL fragment; we sign the person in with it, without any form,
 * and keep the referral code. Outside Telegram this component does nothing.
 */
export default function TelegramMiniApp() {
  useEffect(() => {
    const launch = readLaunchData();
    if (!launch) return;
    let cancelled = false;

    void (async () => {
      const webApp = await loadTelegramScript();
      webApp?.ready?.();
      webApp?.expand?.();
      const initData = webApp?.initData || launch.initData;

      const linking = Boolean(launch.startParam?.startsWith(LINK_PREFIX));
      if (!linking) rememberAcquisitionSource("telegram", "mini_app", launch.startParam ?? undefined);
      if (!linking && launch.startParam && isValidReferralCode(launch.startParam)) {
        // Before sign-in: the registration claim on SIGNED_IN picks the referral up.
        await capturePendingReferral(launch.startParam, "/tg").catch(() => undefined);
      }

      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        // A link always signs in again: the Mini App may hold a session of a separate Telegram account.
        if ((session && !linking) || cancelled || !initData) return;
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData })
        });
        const payload = await response.json() as { tokenHash?: string; error?: string; code?: string };
        if (linking && !response.ok) window.alert(linkErrorText(payload.code));
        if (!response.ok || !payload.tokenHash || cancelled) return;
        if (session) await supabase.auth.signOut({ scope: "local" });
        await supabase.auth.verifyOtp({ token_hash: payload.tokenHash, type: "magiclink" });
      } catch (signInError) {
        // The app still works as a guest; sign-in by Google or email stays available.
        console.warn("Telegram sign-in failed", signInError);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}

function readLaunchData(): { initData: string | null; startParam: string | null } | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  const initData = hash.get("tgWebAppData");
  if (!initData && !search.get("tgWebAppStartParam")) return null;
  const startParam = search.get("tgWebAppStartParam") ?? (initData ? new URLSearchParams(initData).get("start_param") : null);
  return { initData, startParam: startParam?.trim() || null };
}

function loadTelegramScript(): Promise<TelegramWebApp | null> {
  const current = () => (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
  if (current()) return Promise.resolve(current());
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_SCRIPT;
    script.async = true;
    script.onload = () => resolve(current());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
    window.setTimeout(() => resolve(current()), 4000);
  });
}

// Shown outside the app's dictionaries (this component runs before the user context): Russian or English.
function linkErrorText(code: string | undefined): string {
  const ru = typeof navigator !== "undefined" && /^ru\b/i.test(navigator.language);
  if (code === "telegram_account_has_data") {
    return ru
      ? "У этого Telegram уже есть свой аккаунт Open Abundance с данными. Аккаунты не объединяются автоматически, напишите нам через «Контакты»."
      : "This Telegram already has its own Open Abundance account with data. Accounts are not merged automatically; write to us via Contact.";
  }
  if (code === "telegram_linked_elsewhere") {
    return ru ? "Этот Telegram уже привязан к другому аккаунту." : "This Telegram is already linked to another account.";
  }
  return ru
    ? "Не удалось привязать Telegram. Ссылка действует 30 минут: создайте новую в профиле."
    : "Could not link Telegram. The link works for 30 minutes: make a new one in your profile.";
}
