// Pure helpers for the local backup file (no imports, tested directly by node).
// A backup is a snapshot of on-device personal data. Import only merges: it never deletes
// a local record, and a record changed later on this device wins over the file.

export const BACKUP_FORMAT = "open-abundance-local-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_RECORDS_PER_STORE = 20_000;
/** Placeholder for the account id inside user-scoped records and settings keys. */
export const USER_TOKEN = "{user}";

export const CORE_BACKUP_STORES = ["notes", "lists", "tasks", "taskCompletions"] as const;
export const AI_BACKUP_STORES = ["aiChats", "aiMemory"] as const;
export type BackupStoreName = (typeof CORE_BACKUP_STORES)[number] | (typeof AI_BACKUP_STORES)[number];

/** Device settings worth carrying over; service keys (guest id, analytics, caches, queues) are excluded on purpose. */
export const BACKUP_SETTING_KEYS = [
  "openAbundanceLocale",
  "openAbundanceUiScale",
  "openAbundanceColorTheme",
  "openAbundanceAccentTheme",
  "openAbundanceDisplayCurrency",
  "open-abundance:sounds-enabled",
  "open-abundance:daily-reminder-settings:v1"
] as const;

/** Settings keys that contain the account id. */
export const BACKUP_USER_SETTING_PREFIXES = [
  "open-abundance-primary-wish:",
  "open-abundance-wish-milestone:",
  "open-abundance-feed-preferences:v1:"
] as const;

export type BackupRecord = Record<string, unknown> & { id: string };

export type LocalBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  stores: Partial<Record<BackupStoreName, BackupRecord[]>>;
  settings: Record<string, string>;
};

export type BackupCounts = Record<BackupStoreName, number>;

export function countBackup(stores: LocalBackup["stores"]): BackupCounts {
  return {
    notes: stores.notes?.length ?? 0,
    lists: stores.lists?.length ?? 0,
    tasks: stores.tasks?.length ?? 0,
    taskCompletions: stores.taskCompletions?.length ?? 0,
    aiChats: stores.aiChats?.length ?? 0,
    aiMemory: stores.aiMemory?.length ?? 0
  };
}

/** Replaces the account id with USER_TOKEN (export) or USER_TOKEN with the account id (import). */
export function swapUserId<T>(value: T, from: string, to: string): T {
  if (!from) return value;
  if (typeof value === "string") return value.split(from).join(to) as T;
  if (Array.isArray(value)) return value.map((item) => swapUserId(item, from, to)) as T;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      next[key] = key === "userId" || key === "id" ? swapUserId(record[key], from, to) : record[key];
    }
    return next as T;
  }
  return value;
}

export function isUserSettingKey(key: string): boolean {
  return BACKUP_USER_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Validates an untrusted file payload; returns null when it is not a usable backup. */
export function parseBackup(raw: unknown): LocalBackup | null {
  const value = raw as Partial<LocalBackup> | null;
  if (!value || value.format !== BACKUP_FORMAT || typeof value.version !== "number" || value.version > BACKUP_VERSION) return null;
  if (!value.stores || typeof value.stores !== "object") return null;

  const stores: LocalBackup["stores"] = {};
  for (const name of [...CORE_BACKUP_STORES, ...AI_BACKUP_STORES]) {
    const records = (value.stores as Record<string, unknown>)[name];
    if (records === undefined) continue;
    if (!Array.isArray(records) || records.length > MAX_RECORDS_PER_STORE) return null;
    stores[name] = records.filter((record): record is BackupRecord =>
      Boolean(record) && typeof record === "object" && typeof (record as BackupRecord).id === "string" && (record as BackupRecord).id.length > 0
    );
  }

  const settings: Record<string, string> = {};
  if (value.settings && typeof value.settings === "object") {
    for (const [key, setting] of Object.entries(value.settings)) {
      const allowed = (BACKUP_SETTING_KEYS as readonly string[]).includes(key) || isUserSettingKey(key);
      if (allowed && typeof setting === "string" && setting.length <= 20_000) settings[key] = setting;
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: value.version,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    stores,
    settings
  };
}

export type MergeDecision = "add" | "update" | "keep";

/** Decides one record: add when missing, update only when the file copy is strictly newer. */
export function decideMerge(existing: BackupRecord | undefined, incoming: BackupRecord): MergeDecision {
  if (!existing) return "add";
  const existingAt = typeof existing.updatedAt === "string" ? Date.parse(existing.updatedAt) : Number.NaN;
  const incomingAt = typeof incoming.updatedAt === "string" ? Date.parse(incoming.updatedAt) : Number.NaN;
  if (Number.isFinite(incomingAt) && (!Number.isFinite(existingAt) || incomingAt > existingAt)) return "update";
  return "keep";
}

export function backupFileName(date = new Date()): string {
  const day = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return `open-abundance-backup-${day}.json`;
}

export const LAST_BACKUP_KEY = "open-abundance:last-local-backup";
export const BACKUP_REMINDER_SNOOZE_KEY = "open-abundance:backup-reminder-snooze";
const DAY_MS = 86_400_000;

/**
 * Shows a quiet reminder when there is personal data worth keeping and no recent copy:
 * never backed up and the oldest record is a week old, or the last copy is over 30 days
 * old and something changed since.
 */
export function shouldRemindBackup(input: { now: number; oldestRecordAt: number | null; newestRecordAt: number | null; lastBackupAt: number | null; snoozedUntil: number | null }): boolean {
  const { now, oldestRecordAt, newestRecordAt, lastBackupAt, snoozedUntil } = input;
  if (oldestRecordAt === null || newestRecordAt === null) return false;
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  if (lastBackupAt === null) return now - oldestRecordAt >= 7 * DAY_MS;
  return now - lastBackupAt >= 30 * DAY_MS && newestRecordAt > lastBackupAt;
}
