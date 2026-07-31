const DB_NAME = "open-abundance-offline";
const DB_VERSION = 5;

const STORES = [
  ["notes", { keyPath: "id" }],
  ["lists", { keyPath: "id" }],
  ["tasks", { keyPath: "id" }],
  ["taskCompletions", { keyPath: "id" }],
  ["guestIdentity", { keyPath: "key" }],
  ["aiChats", { keyPath: "id" }],
  ["aiUsage", { keyPath: "id" }]
] as const;

export function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, options] of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, options);
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open local data."));
    request.onblocked = () => {
      console.warn("Local data upgrade is waiting for another app tab to close its database connection.");
    };
  });
}
