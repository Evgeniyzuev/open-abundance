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

export const DAILY_REMINDER_CHANGED_EVENT = "oa:daily-reminder-changed";

export function saveDailyReminderSettings(settings: DailyReminderSettings) {
  localStorage.setItem(DAILY_REMINDER_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(DAILY_REMINDER_CHANGED_EVENT));
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Links this browser's push subscription to the signed-in account (no reminder is scheduled). */
export async function registerPushDevice(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const subscription = await getSubscription();
  const accessToken = await getAccessToken();
  if (!subscription || !accessToken) return false;
  try {
    const response = await fetch("/api/notifications/subscriptions", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ subscription: subscription.toJSON(), deviceLabel: getDeviceLabel() })
    });
    return response.ok;
  } catch {
    return false;
  }
}

// The reminder pop-up follows the same "first entry of the day" pattern as the app-open check
// (GrowthAnalytics): one key per person and day, so it appears at most once a day and stops after a few asks.
const PUSH_ASK_MAX_TIMES = 7;

function pushAskKey(userId: string, day: string) {
  return `openAbundancePushAsk:${userId}:${day}`;
}

export function shouldAskPushToday(userId: string): boolean {
  if (!isPushSupported() || Notification.permission !== "default") return false;
  const settings = getDailyReminderSettings();
  if (settings.configured && !settings.enabled) return false; // the person switched reminders off
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(pushAskKey(userId, day))) return false;
    return Number(localStorage.getItem(`openAbundancePushAskCount:${userId}`) ?? 0) < PUSH_ASK_MAX_TIMES;
  } catch {
    return false;
  }
}

export function markPushAskedToday(userId: string): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem(pushAskKey(userId, day), "1");
    const countKey = `openAbundancePushAskCount:${userId}`;
    localStorage.setItem(countKey, String(Number(localStorage.getItem(countKey) ?? 0) + 1));
  } catch {
    // The pop-up may simply show again next time.
  }
}

export async function enableDailyPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const publicKey = await getVapidPublicKey();
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

async function getVapidPublicKey(): Promise<string | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bsikxrsguwketlloflgi.supabase.co").replace(/\/+$/, "");
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-reflection-reminders/vapid-public-key`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { publicKey?: unknown };
    return typeof payload.publicKey === "string" && /^[A-Za-z0-9_-]+$/.test(payload.publicKey)
      ? payload.publicKey
      : null;
  } catch {
    return null;
  }
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

export async function cancelActionReminder(taskId: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const subscription = await getSubscription();
  if (subscription) await cancelReminder(subscription, `task:${taskId}`);
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
    body: JSON.stringify({ subscription: subscription.toJSON(), guestId: guest.guestId, deviceLabel: getDeviceLabel(), ...reminder })
  });
  if (!response.ok) throw new Error("Reminder was not scheduled.");
}

function getDeviceLabel(): string {
  const platform = navigator.userAgent.match(/iPhone|iPad|Android/i)?.[0] ?? navigator.platform ?? "Web";
  return `${platform} · ${navigator.userAgent.includes("CriOS") || navigator.userAgent.includes("Chrome") ? "Chrome" : navigator.userAgent.includes("Safari") ? "Safari" : "Browser"}`.slice(0, 100);
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

/** Asks for notification permission and returns the device's push subscription for server registration. */
export async function enablePushAndGetSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!(await enableDailyPush())) return null;
  const subscription = await getSubscription();
  return subscription ? subscription.toJSON() : null;
}
