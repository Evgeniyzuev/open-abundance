import { getOrCreateLocalGuest } from "@/lib/guestIdentity";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { AppLocale } from "@/lib/i18n";

export const REFLECTION_SETTINGS_KEY = "open-abundance:reflection-settings:v1";
const PENDING_REMINDERS_KEY = "open-abundance:pending-reminders:v1";

export type ReflectionReminderSettings = {
  reviewTime: string;
  enabled: boolean;
  configured: boolean;
};

type ReminderRequest = {
  clientReminderId: string;
  kind: "action" | "inbox_review";
  locale: AppLocale;
  dueAt: string;
  recurring: boolean;
  localTime?: string;
  timezone: string;
  deepLink: string;
};

export function getReflectionReminderSettings(): ReflectionReminderSettings {
  if (typeof window === "undefined") return { reviewTime: "19:00", enabled: false, configured: false };
  try {
    const value = JSON.parse(localStorage.getItem(REFLECTION_SETTINGS_KEY) ?? "null") as Partial<ReflectionReminderSettings> | null;
    return {
      reviewTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(value?.reviewTime ?? "") ? value!.reviewTime! : "19:00",
      enabled: Boolean(value?.enabled),
      configured: Boolean(value?.configured)
    };
  } catch {
    return { reviewTime: "19:00", enabled: false, configured: false };
  }
}

export function saveReflectionReminderSettings(settings: ReflectionReminderSettings) {
  localStorage.setItem(REFLECTION_SETTINGS_KEY, JSON.stringify(settings));
}

export async function enableReflectionPush(): Promise<boolean> {
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

export async function syncInboxReviewReminder(active: boolean, locale: AppLocale, settings = getReflectionReminderSettings()) {
  if (!settings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const subscription = await getSubscription();
  if (!subscription) return;
  if (!active) {
    await cancelReminder(subscription, "reflection-inbox-review");
    return;
  }
  const dueAt = nextLocalTime(settings.reviewTime);
  await submitReminder(subscription, {
    clientReminderId: "reflection-inbox-review",
    kind: "inbox_review",
    locale,
    dueAt: dueAt.toISOString(),
    recurring: true,
    localTime: settings.reviewTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    deepLink: "/?view=goals.notes&reflectionInbox=1"
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
    return Array.isArray(value) ? value : [];
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
