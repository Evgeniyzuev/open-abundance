import { openOfflineDatabase } from "@/lib/offlineDatabase";

export type AiLocalMessage = {
  role: "user" | "assistant";
  content: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
};

export type AiMemoryKind = "goal" | "interest" | "preference" | "reaction" | "feeling";

export type AiMemoryItem = {
  id: string;
  userId: string;
  kind: AiMemoryKind;
  content: string;
  sensitivity: "ordinary" | "sensitive";
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiMemorySettings = {
  id: string;
  userId: string;
  enabled: boolean;
  updatedAt: string;
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
const MEMORY_STORE = "aiMemory";
const DAY_LIMIT = 20;
const MONTH_LIMIT = 300;
const SAVED_CHAT_LIMIT = 50;
const MEMORY_ITEM_LIMIT = 40;

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

export async function getMemoryItems(userId: string): Promise<AiMemoryItem[]> {
  const items = await withStore<AiMemoryItem[]>(MEMORY_STORE, "readonly", (store) => store.getAll());
  return items
    .filter((item) => item.userId === userId && typeof item.kind === "string" && typeof item.content === "string")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveMemoryItem(item: AiMemoryItem): Promise<void> {
  await withStore<IDBValidKey>(MEMORY_STORE, "readwrite", (store) => store.put(item));
  const items = await getMemoryItems(item.userId);
  await Promise.all(items.slice(MEMORY_ITEM_LIMIT).map((staleItem) => deleteMemoryItem(staleItem.id, item.userId)));
}

export async function deleteMemoryItem(id: string, userId: string): Promise<void> {
  const item = await withStore<AiMemoryItem | undefined>(MEMORY_STORE, "readonly", (store) => store.get(id));
  if (!item || item.userId !== userId) return;
  await withStore<undefined>(MEMORY_STORE, "readwrite", (store) => store.delete(id));
}

export async function clearMemory(userId: string): Promise<void> {
  const items = await getMemoryItems(userId);
  await Promise.all(items.map((item) => deleteMemoryItem(item.id, userId)));
}

export async function getMemorySettings(userId: string): Promise<AiMemorySettings> {
  const id = `settings:${userId}`;
  const settings = await withStore<AiMemorySettings | undefined>(MEMORY_STORE, "readonly", (store) => store.get(id));
  return settings ?? { id, userId, enabled: true, updatedAt: new Date().toISOString() };
}

export async function setMemoryEnabled(userId: string, enabled: boolean): Promise<AiMemorySettings> {
  const settings: AiMemorySettings = { id: `settings:${userId}`, userId, enabled, updatedAt: new Date().toISOString() };
  await withStore<IDBValidKey>(MEMORY_STORE, "readwrite", (store) => store.put(settings));
  return settings;
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
