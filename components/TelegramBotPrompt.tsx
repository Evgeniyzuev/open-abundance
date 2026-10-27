"use client";

import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { trackClientEvent } from "@/lib/clientAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

const FIRST_CHECK_DELAY_MS = 25_000; // after the push prompt (9 s), so the two do not open together
const RETRY_DELAY_MS = 10_000;
const MAX_RETRIES = 4;
const MAX_TIMES = 5;

type Status = { configured: boolean; linked: boolean; canWrite: boolean; botUrl: string | null };

/**
 * The Telegram twin of PushReminderPrompt: every push is also sent by the bot, which may write only after the person
 * pressed Start. Once a day (at most five times), when Telegram is not linked or the bot cannot write yet, offers the one
 * step that fixes it. Inside the Mini App it asks Telegram's own permission (requestWriteAccess) after explaining why:
 * by Oct 27 the bot was blocked for 14 people, mostly Mini App users who never allowed it.
 */
export default function TelegramBotPrompt() {
  const { t, user } = useUserContext();
  const [status, setStatus] = useState<Status | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !shouldAsk(userId) || askedBySystemToday()) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const check = async () => {
      if (cancelled) return;
      if (document.querySelector('[role="dialog"]')) {
        if (attempts < MAX_RETRIES) {
          attempts += 1;
          timer = window.setTimeout(() => void check(), RETRY_DELAY_MS);
        }
        return;
      }
      const response = await fetchWithSupabaseAuth("/api/telegram/status", { cache: "no-store" }, { authRequired: true }).catch(() => null);
      const next = response?.ok ? ((await response.json()) as Status) : null;
      if (cancelled || !next?.configured || next.canWrite) return;
      markAsked(userId);
      setStatus(next);
      void trackClientEvent("soft_prompt_shown", { kind: "telegram_bot", linked: next.linked });
    };

    timer = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  function later() {
    void trackClientEvent("soft_prompt_action", { kind: "telegram_bot", action: "later" });
    setStatus(null);
  }

  async function accept() {
    const current = status;
    setStatus(null);
    void trackClientEvent("soft_prompt_action", { kind: "telegram_bot", action: current?.linked ? "open_bot" : "link" });
    const webApp = telegramWebApp();
    if (webApp?.requestWriteAccess && (!webApp.isVersionAtLeast || webApp.isVersionAtLeast("6.9"))) {
      try {
        webApp.requestWriteAccess((granted) => void trackClientEvent("soft_prompt_action", { kind: "telegram_bot", action: granted ? "write_granted" : "write_declined" }));
        return;
      } catch {
        // Fall through to the bot chat.
      }
    }
    if (current?.linked && current.botUrl) {
      if (webApp?.openTelegramLink) webApp.openTelegramLink(current.botUrl);
      else window.open(current.botUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Not linked yet: the one-time link opens the Mini App, which links the account and asks to let the bot write.
    const response = await fetchWithSupabaseAuth("/api/auth/telegram/link", { method: "POST", cache: "no-store" }, { authRequired: true }).catch(() => null);
    const payload = response?.ok ? ((await response.json()) as { url?: string }) : null;
    if (payload?.url) window.location.href = payload.url;
  }

  if (!status) return null;
  const inMiniApp = Boolean(telegramWebApp());

  return (
    <Sheet bare className="small challenge-complete-modal" titleId="telegram-bot-title" onClose={later}>
      <span className="streak-complete-icon"><Send size={30} aria-hidden="true" /></span>
      <h2 id="telegram-bot-title">{t("telegramBot.prompt.title")}</h2>
      <p>{t(inMiniApp ? "telegramBot.prompt.bodyAllow" : status.linked ? "telegramBot.prompt.bodyStart" : "telegramBot.prompt.bodyLink")}</p>
      <div className="push-prompt-actions">
        <button className="push-prompt-later" type="button" onClick={later}>{t("push.prompt.later")}</button>
        <button className="challenge-primary-action" type="button" onClick={() => void accept()}>
          {t(inMiniApp ? "telegramBot.prompt.allow" : status.linked ? "profile.telegramBot.action" : "profile.telegramLink.action")}
        </button>
      </div>
    </Sheet>
  );
}

type TelegramWebApp = {
  initData?: string;
  requestWriteAccess?: (callback?: (granted: boolean) => void) => void;
  isVersionAtLeast?: (version: string) => boolean;
  openTelegramLink?: (url: string) => void;
};

function telegramWebApp(): TelegramWebApp | null {
  const webApp = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return webApp?.initData ? webApp : null;
}

/** TelegramMiniApp's own weekly permission request ran in the last day: do not ask twice. */
function askedBySystemToday(): boolean {
  if (!telegramWebApp()) return false;
  try {
    return Date.now() - Number(localStorage.getItem("oa.telegram.writeAccessAskedAt") ?? 0) < 86_400_000;
  } catch {
    return false;
  }
}

function shouldAsk(userId: string): boolean {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(`openAbundanceTelegramAsk:${userId}:${day}`)) return false;
    return Number(localStorage.getItem(`openAbundanceTelegramAskCount:${userId}`) ?? 0) < MAX_TIMES;
  } catch {
    return false;
  }
}

function markAsked(userId: string): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`openAbundanceTelegramAsk:${userId}:${day}`, "1");
    const countKey = `openAbundanceTelegramAskCount:${userId}`;
    localStorage.setItem(countKey, String(Number(localStorage.getItem(countKey) ?? 0) + 1));
  } catch {
    // The pop-up may simply show again next time.
  }
}
