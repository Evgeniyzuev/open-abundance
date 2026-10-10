"use client";

import { useCallback, useEffect, useState } from "react";
import { InstallGuideDetails } from "@/components/InstallGuide";
import type { MessageKey } from "@/lib/i18n";
import { isStandaloneDisplay, type InstallPingState } from "@/lib/installPing";
import { enablePushAndGetSubscription } from "@/lib/pushReminders";
import { canPromptPwaInstall, promptPwaInstall, subscribeToPwaInstallPrompt } from "@/lib/pwaInstall";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type InstallPingChallengeProps = {
  locale: string;
  t: TFunction;
  onPassedChange?: (passed: boolean) => void;
};

/**
 * Install check: notifications enabled from the installed app, then timed pings. Opening the app
 * within three minutes of a ping completes it. State is read on mount and when the tab becomes
 * visible again; nothing polls in the background.
 */
export default function InstallPingChallenge({ locale, t, onPassedChange }: InstallPingChallengeProps) {
  const [state, setState] = useState<InstallPingState>({ status: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const standalone = isStandaloneDisplay();

  useEffect(() => {
    const update = () => setInstallPromptAvailable(canPromptPwaInstall());
    update();
    return subscribeToPwaInstallPrompt(update);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/install-ping", { cache: "no-store" }, { authRequired: true });
      if (!response.ok) return;
      const next = (await response.json()) as InstallPingState;
      setState(next);
      onPassedChange?.(next.status === "completed");
    } catch {
      // The explanation stays visible if the state cannot be loaded.
    }
  }, [onPassedChange]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const subscription = await enablePushAndGetSubscription();
      if (!subscription) throw new Error(t("challenges.install.startFailed"));
      const response = await fetchWithSupabaseAuth("/api/challenges/install-ping", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          standalone,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          locale
        })
      }, { authRequired: true });
      const payload = (await response.json()) as InstallPingState & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("challenges.install.startFailed"));
      setState(payload);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : t("challenges.install.startFailed"));
    } finally {
      setBusy(false);
    }
  }

  const nextTime = state.nextDueAt
    ? new Date(state.nextDueAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="attention-challenge">
      <div className="attention-challenge-heading">
        <span>{t("challenges.install.eyebrow")}</span>
        <strong>{t("challenges.install.title")}</strong>
      </div>

      {state.status === "completed" ? <p className="challenge-note">{t("challenges.install.completed")}</p> : null}

      {state.status === "waiting" ? (
        <>
          <p className="challenge-note">{t("challenges.install.waiting")}</p>
          {nextTime ? <p className="challenge-note">{t("challenges.install.next", { time: nextTime })}</p> : null}
          {state.missed ? <p className="challenge-note">{t("challenges.install.missed", { missed: state.missed, planned: state.planned ?? 0 })}</p> : null}
        </>
      ) : null}

      {state.status === "failed" ? <p className="challenge-error">{t("challenges.install.failed")}</p> : null}

      {state.status === "none" || state.status === "failed" ? (
        <>
          {!standalone ? <p className="challenge-note">{t("challenges.install.openInstalled")}</p> : null}
          {!standalone ? (
            <InstallGuideDetails
              installPromptAvailable={installPromptAvailable}
              isDesktop={!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}
              locale={locale}
              t={t}
              onInstall={() => { void promptPwaInstall(); }}
            />
          ) : null}
          <button className="challenge-primary-action" disabled={!standalone || busy} type="button" onClick={() => void start()}>
            {busy ? t("app.common.loading") : state.status === "failed" ? t("challenges.install.retry") : t("challenges.install.start")}
          </button>
        </>
      ) : null}

      {error ? <p className="challenge-error">{error}</p> : null}
    </section>
  );
}
