import { openOfflineDatabase } from "@/lib/offlineDatabase";

export type AiLocalMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiLocalChat = {
  id: string;
  userId: string;
  status: "draft" | "saved";
  title: string;
  messages: AiLocalMessage[];
  createdAt: string;
  updatedAt: string;
};

export type AiLocalUsage = {
  id: string;
  userId: string;
  dayKey: string;
  monthKey: string;
  dayCount: number;
  monthCount: number;
};

export type LocalQuota = {
  dayCount: number;
  monthCount: number;
  dayLimit: number;
  monthLimit: number;
  dayRemaining: number;
  monthRemaining: number;
  dayKey: string;
  monthKey: string;
  consumed?: boolean;
};

const CHAT_STORE = "aiChats";
const USAGE_STORE = "aiUsage";
const DAY_LIMIT = 20;
const MONTH_LIMIT = 300;
const SAVED_CHAT_LIMIT = 50;

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openOfflineDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local AI storage request failed."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Local AI storage transaction failed."));
    };
  });
}

export async function getDraftChat(userId: string): Promise<AiLocalChat | null> {
  const chats = await withStore<AiLocalChat[]>(CHAT_STORE, "readonly", (store) => store.getAll());
  return chats
    .filter((chat) => chat.userId === userId && chat.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export async function getSavedChats(userId: string): Promise<AiLocalChat[]> {
  const chats = await withStore<AiLocalChat[]>(CHAT_STORE, "readonly", (store) => store.getAll());
  return chats
    .filter((chat) => chat.userId === userId && chat.status === "saved")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveChat(chat: AiLocalChat): Promise<void> {
  await withStore<IDBValidKey>(CHAT_STORE, "readwrite", (store) => store.put(chat));

  const savedChats = await getSavedChats(chat.userId);
  const staleChats = savedChats.slice(SAVED_CHAT_LIMIT);
  await Promise.all(staleChats.map((staleChat) => deleteChat(staleChat.id, chat.userId)));
}

export async function deleteChat(id: string, userId: string): Promise<void> {
  const chat = await withStore<AiLocalChat | undefined>(CHAT_STORE, "readonly", (store) => store.get(id));
  if (!chat || chat.userId !== userId) return;
  await withStore<undefined>(CHAT_STORE, "readwrite", (store) => store.delete(id));
}

export async function getLocalQuota(userId: string, now = new Date()): Promise<LocalQuota> {
  const usage = await withStore<AiLocalUsage | undefined>(USAGE_STORE, "readonly", (store) => store.get(userId));
  return toQuota(usage, userId, now);
}

export async function consumeLocalMessage(userId: string, now = new Date()): Promise<LocalQuota> {
  const dayKey = toUtcDayKey(now);
  const monthKey = toUtcMonthKey(now);
  const db = await openOfflineDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(USAGE_STORE, "readwrite");
    const store = tx.objectStore(USAGE_STORE);
    const request = store.get(userId);
    let quota = toQuota(undefined, userId, now);

    request.onsuccess = () => {
      const current = normalizeUsage(request.result, userId, dayKey, monthKey);
      if (current.dayCount >= DAY_LIMIT || current.monthCount >= MONTH_LIMIT) {
        quota = { ...toQuota(current, userId, now), consumed: false };
        return;
      }

      const next: AiLocalUsage = {
        ...current,
        dayCount: current.dayCount + 1,
        monthCount: current.monthCount + 1
      };
      store.put(next);
      quota = { ...toQuota(next, userId, now), consumed: true };
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read local AI usage."));
    tx.oncomplete = () => {
      db.close();
      resolve(quota);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to update local AI usage."));
    };
  });
}

function normalizeUsage(value: unknown, userId: string, dayKey: string, monthKey: string): AiLocalUsage {
  const usage = isRecord(value) ? value : {};
  return {
    id: userId,
    userId,
    dayKey,
    monthKey,
    dayCount: usage.dayKey === dayKey && typeof usage.dayCount === "number" ? usage.dayCount : 0,
    monthCount: usage.monthKey === monthKey && typeof usage.monthCount === "number" ? usage.monthCount : 0
  };
}

function toQuota(value: AiLocalUsage | undefined, userId: string, now: Date): LocalQuota {
  const usage = normalizeUsage(value, userId, toUtcDayKey(now), toUtcMonthKey(now));
  return {
    dayCount: usage.dayCount,
    monthCount: usage.monthCount,
    dayLimit: DAY_LIMIT,
    monthLimit: MONTH_LIMIT,
    dayRemaining: Math.max(0, DAY_LIMIT - usage.dayCount),
    monthRemaining: Math.max(0, MONTH_LIMIT - usage.monthCount),
    dayKey: usage.dayKey,
    monthKey: usage.monthKey
  };
}

function toUtcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toUtcMonthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
