export const OFFLINE_DB_NAME = "open-abundance-offline";
export const OFFLINE_DB_VERSION = 4;

const DB_OPEN_TIMEOUT_MS = 5_000;
const STORE_DEFINITIONS = [
  { keyPath: "id", name: "notes" },
  { keyPath: "id", name: "lists" },
  { keyPath: "id", name: "tasks" },
  { keyPath: "id", name: "taskCompletions" },
  { keyPath: "key", name: "guestIdentity" }
] as const;

export function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      rejectOnce(new Error("Opening the local database timed out."));
    }, DB_OPEN_TIMEOUT_MS);

    function rejectOnce(error: Error | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error ?? new Error("Failed to open the local database."));
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const definition of STORE_DEFINITIONS) {
        if (!db.objectStoreNames.contains(definition.name)) {
          db.createObjectStore(definition.name, { keyPath: definition.keyPath });
        }
      }
    };

    request.onblocked = () => {
      rejectOnce(new Error("The local database is blocked by another open app window."));
    };

    request.onerror = () => {
      rejectOnce(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
