export type LocalGuestIdentity = {
  guestId: string;
  createdAt: string;
  lastSeenAt: string;
  claimedUserId?: string;
  pendingReferral?: PendingReferral;
};

import { openOfflineDatabase } from "@/lib/offlineDatabase";

export type PendingReferral = {
  referralCode: string;
  capturedAt: string;
  landingPath: string;
  claimedAt?: string;
};

const GUEST_STORE = "guestIdentity";
const GUEST_KEY = "current";

async function withGuestStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GUEST_STORE, mode);
    const store = tx.objectStore(GUEST_STORE);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getOrCreateLocalGuest(): Promise<LocalGuestIdentity> {
  const existing = await readLocalGuest();
  const now = new Date().toISOString();

  if (existing) {
    const nextGuest = { ...existing, lastSeenAt: now };
    await writeLocalGuest(nextGuest);
    return nextGuest;
  }

  const guest: LocalGuestIdentity = {
    guestId: crypto.randomUUID(),
    createdAt: now,
    lastSeenAt: now
  };
  await writeLocalGuest(guest);
  return guest;
}

export async function readLocalGuest(): Promise<LocalGuestIdentity | undefined> {
  const record = await withGuestStore<{ key: string; value: LocalGuestIdentity } | undefined>("readonly", (store) => store.get(GUEST_KEY));
  return record?.value;
}

export async function markLocalGuestClaimed(userId: string): Promise<LocalGuestIdentity> {
  const guest = await getOrCreateLocalGuest();
  const nextGuest = {
    ...guest,
    claimedUserId: userId,
    lastSeenAt: new Date().toISOString()
  };
  await writeLocalGuest(nextGuest);
  return nextGuest;
}

export async function capturePendingReferral(referralCode: string, landingPath: string): Promise<LocalGuestIdentity> {
  const normalizedCode = referralCode.trim();
  if (!isValidReferralCode(normalizedCode)) {
    return getOrCreateLocalGuest();
  }

  const guest = await getOrCreateLocalGuest();
  const nextGuest = {
    ...guest,
    pendingReferral: {
      referralCode: normalizedCode,
      capturedAt: new Date().toISOString(),
      landingPath
    },
    lastSeenAt: new Date().toISOString()
  };
  await writeLocalGuest(nextGuest);
  return nextGuest;
}

export async function markPendingReferralClaimed(): Promise<LocalGuestIdentity> {
  const guest = await getOrCreateLocalGuest();
  if (!guest.pendingReferral) return guest;

  const nextGuest = {
    ...guest,
    pendingReferral: {
      ...guest.pendingReferral,
      claimedAt: new Date().toISOString()
    },
    lastSeenAt: new Date().toISOString()
  };
  await writeLocalGuest(nextGuest);
  return nextGuest;
}

export function isValidReferralCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{4,32}$/.test(value);
}

async function writeLocalGuest(value: LocalGuestIdentity): Promise<void> {
  await withGuestStore<IDBValidKey>("readwrite", (store) => store.put({ key: GUEST_KEY, value }));
}
