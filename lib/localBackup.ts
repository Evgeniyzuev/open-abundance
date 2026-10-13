import { openOfflineDatabase } from "@/lib/offlineDatabase";
import { NOTES_CHANGED_EVENT } from "@/lib/notesStore";
import { TASKS_CHANGED_EVENT } from "@/lib/tasksStore";
import {
  AI_BACKUP_STORES,
  BACKUP_FORMAT,
  BACKUP_SETTING_KEYS,
  BACKUP_VERSION,
  CORE_BACKUP_STORES,
  decideMerge,
  isUserSettingKey,
  LAST_BACKUP_KEY,
  swapUserId,
  USER_TOKEN,
  type BackupRecord,
  type BackupStoreName,
  type LocalBackup
} from "@/lib/localBackupFormat";

export type BackupImportResult = {
  added: number;
  updated: number;
  kept: number;
  /** Imported tasks with a reminder still in the future, so push reminders can be scheduled again. */
  futureReminders: { id: string; remindAt: string }[];
};

/** Reads on-device personal data into a backup object. Nothing leaves the device here. */
export async function collectLocalBackup(options: { includeAi: boolean; userId: string | null }): Promise<LocalBackup> {
  const names: BackupStoreName[] = [...CORE_BACKUP_STORES, ...(options.includeAi && options.userId ? AI_BACKUP_STORES : [])];
  const db = await openOfflineDatabase();
  const stores: LocalBackup["stores"] = {};
  try {
    for (const name of names) {
      const records = await readAll(db, name);
      stores[name] = AI_BACKUP_STORES.includes(name as (typeof AI_BACKUP_STORES)[number])
        ? records.filter((record) => record.userId === options.userId).map((record) => swapUserId(record, options.userId ?? "", USER_TOKEN))
        : records;
    }
  } finally {
    db.close();
  }

  const settings: Record<string, string> = {};
  try {
    for (const key of BACKUP_SETTING_KEYS) {
      const value = window.localStorage.getItem(key);
      if (value !== null) settings[key] = value;
    }
    if (options.userId) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !isUserSettingKey(key) || !key.includes(options.userId)) continue;
        const value = window.localStorage.getItem(key);
        if (value !== null) settings[swapUserId(key, options.userId, USER_TOKEN)] = value;
      }
    }
  } catch {
    // Settings are optional; records are the part that matters.
  }

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), stores, settings };
}

/** Merges a validated backup into this device. Never deletes or overwrites newer local records. */
export async function importLocalBackup(backup: LocalBackup, userId: string | null): Promise<BackupImportResult> {
  const result: BackupImportResult = { added: 0, updated: 0, kept: 0, futureReminders: [] };
  const db = await openOfflineDatabase();
  try {
    for (const [name, rawRecords] of Object.entries(backup.stores) as [BackupStoreName, BackupRecord[]][]) {
      const isAi = AI_BACKUP_STORES.includes(name as (typeof AI_BACKUP_STORES)[number]);
      if (isAi && !userId) continue;
      const records = isAi ? rawRecords.map((record) => swapUserId(record, USER_TOKEN, userId ?? "")) : rawRecords;
      const existing = new Map((await readAll(db, name)).map((record) => [record.id, record]));
      const writes: BackupRecord[] = [];
      for (const record of records) {
        const decision = decideMerge(existing.get(record.id), record);
        if (decision === "keep") result.kept += 1;
        else {
          if (decision === "add") result.added += 1;
          else result.updated += 1;
          writes.push(isAi ? record : { ...record, syncStatus: "local" });
        }
      }
      await putAll(db, name, writes);
      if (name === "tasks") {
        const now = Date.now();
        for (const task of writes) {
          const remindAt = typeof task.remindAt === "string" ? task.remindAt : null;
          if (remindAt && Date.parse(remindAt) > now && !task.completed && !task.deleted) result.futureReminders.push({ id: task.id, remindAt });
        }
      }
    }
  } finally {
    db.close();
  }

  try {
    for (const [rawKey, value] of Object.entries(backup.settings)) {
      if (isUserSettingKey(rawKey) && !userId) continue;
      const key = swapUserId(rawKey, USER_TOKEN, userId ?? "");
      // Device preferences already set here stay as they are.
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    }
  } catch {
    // Settings are optional.
  }

  window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  return result;
}

export function markBackupSaved(): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // The reminder may show again; the file itself is saved.
  }
}

function readAll(db: IDBDatabase, name: string): Promise<BackupRecord[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name, "readonly").objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result as BackupRecord[]);
    request.onerror = () => reject(request.error);
  });
}

function putAll(db: IDBDatabase, name: string, records: BackupRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    const store = tx.objectStore(name);
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
