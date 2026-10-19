"use client";

import { useEffect, useState } from "react";
import { useUserContext } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import {
  DAILY_REMINDER_CHANGED_EVENT,
  enableDailyPush,
  getDailyReminderSettings,
  isPushSupported,
  registerPushDevice,
  saveDailyReminderSettings,
  syncTodayDailyReminder
} from "@/lib/pushReminders";

/** Master on/off for task reminders (the daily reminder plus push for the "Reminders" category). Lives in Appearance. */
export default function ReminderToggle() {
  const { locale, t, user } = useUserContext();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const refresh = () => setEnabled(isPushSupported() && getDailyReminderSettings().enabled && Notification.permission === "granted");
    setSupported(isPushSupported());
    refresh();
    window.addEventListener(DAILY_REMINDER_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DAILY_REMINDER_CHANGED_EVENT, refresh);
  }, []);

  async function savePushPreference(pushEnabled: boolean) {
    try {
      const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const current = await fetch("/api/notifications/preferences", { cache: "no-store", headers })
        .then((response) => response.json() as Promise<{ preferences?: Array<{ category: string; in_app_enabled: boolean }> }>)
        .catch(() => ({ preferences: [] }));
      const inAppEnabled = current.preferences?.find((item) => item.category === "reminders")?.in_app_enabled ?? true;
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        cache: "no-store",
        headers,
        body: JSON.stringify({ category: "reminders", inAppEnabled, pushEnabled, locale })
      });
    } catch {
      // The device-level switch below still applies.
    }
  }

  async function change(next: boolean) {
    if (busy || next === enabled) return;
    setBusy(true);
    setFailed(false);
    try {
      if (next) {
        const allowed = await enableDailyPush().catch(() => false);
        if (!allowed) {
          setFailed(true);
          return;
        }
        const settings = { ...getDailyReminderSettings(), configured: true, enabled: true };
        saveDailyReminderSettings(settings);
        await registerPushDevice();
        await syncTodayDailyReminder(Boolean(user), locale, settings).catch(() => undefined);
        await savePushPreference(true);
      } else {
        const settings = { ...getDailyReminderSettings(), configured: true, enabled: false };
        saveDailyReminderSettings(settings);
        await syncTodayDailyReminder(false, locale, settings).catch(() => undefined);
        await savePushPreference(false);
      }
      setEnabled(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="appearance-setting-row">
      <span className="appearance-setting-label">{t("push.setting.title")}</span>
      <div className="appearance-sound-control">
        <small>{supported ? t("push.setting.description") : t("push.setting.unsupported")}</small>
        {supported ? (
          <div className="appearance-options" role="group" aria-label={t("push.setting.title")}>
            {[true, false].map((value) => (
              <button
                className={enabled === value ? "active" : ""}
                type="button"
                aria-pressed={enabled === value}
                disabled={busy}
                key={String(value)}
                onClick={() => void change(value)}
              >
                {value ? t("profile.attention.on") : t("profile.attention.off")}
              </button>
            ))}
          </div>
        ) : null}
        {failed ? <small role="alert">{t("today.dailyReminderUnavailable")}</small> : null}
      </div>
    </div>
  );
}
