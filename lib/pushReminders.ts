import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { AppLocale } from "@/lib/i18n";

export const DAILY_REMINDER_SETTINGS_KEY = "open-abundance:daily-reminder-settings:v1";
export const LEGACY_REFLECTION_SETTINGS_KEY = "open-abundance:reflection-settings:v1";
const PENDING_REMINDERS_KEY = "open-abundance:pending-reminders:v1";

export type DailyReminderSettings = {
  reviewTime: string;
  enabled: boolean;
  configured: boolean;
};

type ReminderRequest = {
  clientReminderId: string;
  kind: "action" | "today_daily";
  locale: AppLocale;
  dueAt: string;
  recurring: boolean;
  localTime?: string;
  timezone: string;
  deepLink: string;
};

export function getDailyReminderSettings(): DailyReminderSettings {
  if (typeof window === "undefined") return { reviewTime: "19:00", enabled: false, configured: false };
  try {
    const currentValue = localStorage.getItem(DAILY_REMINDER_SETTINGS_KEY);
    const sourceValue = currentValue ?? localStorage.getItem(LEGACY_REFLECTION_SETTINGS_KEY);
    const value = JSON.parse(sourceValue ?? "null") as Partial<DailyReminderSettings> | null;
    const settings = {
      reviewTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(value?.reviewTime ?? "") ? value!.reviewTime! : "19:00",
      enabled: Boolean(value?.enabled),
      configured: Boolean(value?.configured)
    };
    if (!currentValue && sourceValue) localStorage.setItem(DAILY_REMINDER_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch {
    return { reviewTime: "19:00", enabled: false, configured: false };
  }
}

export function saveDailyReminderSettings(settings: DailyReminderSettings) {
  localStorage.setItem(DAILY_REMINDER_SETTINGS_KEY, JSON.stringify(settings));
}

export async function enableDailyPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  return true;
}

export async function syncTodayDailyReminder(active: boolean, locale: AppLocale, settings = getDailyReminderSettings()) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const subscription = await getSubscription();
  if (!subscription) return;
  await cancelReminder(subscription, "reflection-inbox-review");
  if (!active || !settings.enabled) {
    await cancelReminder(subscription, "today-daily");
    return;
  }
  const dueAt = nextLocalTime(settings.reviewTime);
  await submitReminder(subscription, {
    clientReminderId: "today-daily",
    kind: "today_daily",
    locale,
    dueAt: dueAt.toISOString(),
    recurring: true,
    localTime: settings.reviewTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    deepLink: "/?view=home"
  });
}

export async function scheduleActionReminder(taskId: string, dueAt: string, locale: AppLocale) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const subscription = await getSubscription();
  if (!subscription) return;
  const request: ReminderRequest = {
    clientReminderId: `task:${taskId}`,
    kind: "action",
    locale,
    dueAt,
    recurring: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    deepLink: `/?view=goals.checks&task=${encodeURIComponent(taskId)}`
  };
  try {
    await submitReminder(subscription, request);
  } catch {
    queuePendingReminder(request);
  }
}

export async function flushPendingReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const pending = readPendingReminders();
  if (pending.length === 0) return;
  const subscription = await getSubscription();
  if (!subscription) return;
  const remaining: ReminderRequest[] = [];
  for (const request of pending) {
    try {
      await submitReminder(subscription, request);
    } catch {
      remaining.push(request);
    }
  }
  localStorage.setItem(PENDING_REMINDERS_KEY, JSON.stringify(remaining));
}

async function submitReminder(subscription: PushSubscription, reminder: ReminderRequest) {
  const guest = await getOrCreateLocalGuest();
  const accessToken = await getAccessToken();
  const response = await fetch("/api/reminders", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify({ subscription: subscription.toJSON(), guestId: guest.guestId, ...reminder })
  });
  if (!response.ok) throw new Error("Reminder was not scheduled.");
}

async function cancelReminder(subscription: PushSubscription, clientReminderId: string) {
  await fetch("/api/reminders", {
    method: "DELETE",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), clientReminderId })
  }).catch(() => undefined);
}

async function getSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

function nextLocalTime(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const due = new Date();
  due.setHours(hours, minutes, 0, 0);
  if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
  return due;
}

function queuePendingReminder(reminder: ReminderRequest) {
  const pending = readPendingReminders().filter((item) => item.clientReminderId !== reminder.clientReminderId);
  pending.push(reminder);
  localStorage.setItem(PENDING_REMINDERS_KEY, JSON.stringify(pending.slice(-50)));
}

function readPendingReminders(): ReminderRequest[] {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_REMINDERS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is ReminderRequest => item?.kind === "action" || item?.kind === "today_daily")
      : [];
  } catch {
    return [];
  }
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
