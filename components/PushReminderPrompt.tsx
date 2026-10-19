"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import {
  enableDailyPush,
  getDailyReminderSettings,
  markPushAskedToday,
  registerPushDevice,
  saveDailyReminderSettings,
  shouldAskPushToday,
  syncTodayDailyReminder
} from "@/lib/pushReminders";

const FIRST_CHECK_DELAY_MS = 5_000;
const RETRY_DELAY_MS = 8_000;
const MAX_RETRIES = 4;

/**
 * Once a day, on the first visit of the day (same per-day key idea as the app-open check), asks whether to remind
 * about tasks. Push is on unless switched off, but a browser needs an explicit "Allow", so this asks with one tap.
 * It waits while another dialog is open (first reward, level up...) and never shows after Allow, Block or switching off.
 */
export default function PushReminderPrompt() {
  const { locale, t, user } = useUserContext();
  const [open, setOpen] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const check = () => {
      if (cancelled) return;
      if (!shouldAskPushToday(userId)) return;
      if (document.querySelector('[role="dialog"]') && attempts < MAX_RETRIES) {
        attempts += 1;
        timer = window.setTimeout(check, RETRY_DELAY_MS);
        return;
      }
      if (document.querySelector('[role="dialog"]')) return; // still busy: try again on the next visit
      markPushAskedToday(userId);
      setOpen(true);
    };

    timer = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  async function accept() {
    setOpen(false);
    const enabled = await enableDailyPush().catch(() => false);
    if (!enabled) return;
    const next = { ...getDailyReminderSettings(), configured: true, enabled: true };
    saveDailyReminderSettings(next);
    await registerPushDevice();
    await syncTodayDailyReminder(Boolean(userId), locale, next).catch(() => undefined);
  }

  if (!open) return null;

  return (
    <Sheet bare className="small challenge-complete-modal" titleId="push-reminder-title" onClose={() => setOpen(false)}>
      <span className="streak-complete-icon"><Bell size={30} aria-hidden="true" /></span>
      <h2 id="push-reminder-title">{t("push.prompt.title")}</h2>
      <p>{t("push.prompt.body")}</p>
      <button className="primary-button" type="button" onClick={() => void accept()}>{t("push.prompt.enable")}</button>
      <button className="text-button" type="button" onClick={() => setOpen(false)}>{t("push.prompt.later")}</button>
    </Sheet>
  );
}
