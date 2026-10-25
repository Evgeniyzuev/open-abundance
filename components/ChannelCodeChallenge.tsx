"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import { enableDailyPush, registerPushDevice } from "@/lib/pushReminders";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
type Channel = "telegram" | "push" | "nova";
type Problem = "telegram_not_linked" | "bot_not_started" | "no_push_device" | "not_installed" | "failed";

type ChannelCodeChallengeProps = {
  challengeId: string;
  channel: Channel;
  /** Sent with the request: "Install the app" gives its code only to the app opened from the home screen. */
  standalone?: boolean;
  t: TFunction;
  onCodeChange: (code: string) => void;
};

/**
 * "Get a code" challenge: "Send the code" delivers today's code through the challenge's channel (Telegram bot, web
 * push or Nova chat, app/api/challenges/channel-code); the person types it here and presses Check completion. When the
 * channel is not ready yet, the card says what to do and offers the one button that fixes it.
 */
export default function ChannelCodeChallenge({ challengeId, channel, standalone, t, onCodeChange }: ChannelCodeChallengeProps) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setSent(false);
    setProblem(null);
    setCode("");
    onCodeChange("");
  }, [challengeId, channel, onCodeChange]);

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/challenges/channel-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, ...(standalone === undefined ? {} : { standalone }) })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { sent?: boolean; code?: string; botUrl?: string | null };
      setBotUrl(payload.botUrl ?? null);
      if (payload.sent) setSent(true);
      else setProblem(payload.code === "telegram_not_linked" || payload.code === "bot_not_started" || payload.code === "no_push_device" || payload.code === "not_installed" ? payload.code : "failed");
    } catch {
      setProblem("failed");
    } finally {
      setBusy(false);
    }
  }

  async function linkTelegram() {
    try {
      const response = await fetchWithSupabaseAuth("/api/auth/telegram/link", { method: "POST", cache: "no-store" }, { authRequired: true });
      const payload = (await response.json()) as { url?: string };
      if (payload.url) window.location.href = payload.url;
      else setProblem("failed");
    } catch {
      setProblem("failed");
    }
  }

  async function enablePush() {
    setBusy(true);
    const enabled = await enableDailyPush().catch(() => false);
    const registered = enabled ? await registerPushDevice().catch(() => false) : false;
    setBusy(false);
    if (registered) await send();
    else setProblem("no_push_device");
  }

  return (
    <section className="attention-challenge challenge-code-box">
      <button className="secondary-button" type="button" disabled={busy} onClick={() => void send()}>
        {sent ? t("challenges.code.resend") : t("challenges.code.send")}
      </button>
      {sent ? <p className="challenge-note">{t(`challenges.code.sent.${channel}` as MessageKey)}</p> : null}
      {sent && channel === "nova" ? <a className="secondary-button" href="/?view=home.ideas">{t("challenges.code.openNova")}</a> : null}
      {problem ? <p className="challenge-note" role="status">{t(`challenges.code.problem.${problem}` as MessageKey)}</p> : null}
      {problem === "telegram_not_linked" ? <button className="secondary-button" type="button" onClick={() => void linkTelegram()}>{t("profile.telegramLink.action")}</button> : null}
      {problem === "bot_not_started" && botUrl ? <a className="secondary-button" href={botUrl} target="_blank" rel="noreferrer">{t("profile.telegramBot.action")}</a> : null}
      {problem === "no_push_device" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void enablePush()}>{t("push.prompt.enable")}</button> : null}
      <label className="challenge-code-input">
        <span>{t("challenges.code.label")}</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            onCodeChange(next);
          }}
        />
      </label>
    </section>
  );
}
