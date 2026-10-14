// Free wardrobe of the Future Sim avatar: simple clothes, one item per slot.
// Premium models (cars, houses, yachts) are paid items and live elsewhere; the outfit is stored locally for now
// and moves to the server when a showcase for other people is built.

export const SIM_SLOTS = ["head", "face", "top", "bottom", "feet", "extra"] as const;
export type SimSlot = (typeof SIM_SLOTS)[number];

export type SimClothing = { id: string; slot: SimSlot; paths: string[] };

// Drawn in the 100x150 box of SimAvatar.
export const SIM_CLOTHES: SimClothing[] = [
  { id: "cap", slot: "head", paths: ["M36 21 Q36 5 50 5 Q64 5 64 21 Z", "M60 21 H79"] },
  { id: "glasses", slot: "face", paths: ["M38 26 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", "M52 26 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", "M48 26 H52"] },
  { id: "tshirt", slot: "top", paths: ["M33 46 L21 57 L28 65 L34 59 V90 H66 V59 L72 65 L79 57 L67 46 Q50 54 33 46 Z"] },
  { id: "jacket", slot: "top", paths: ["M33 46 L19 60 L25 86 L32 84 L34 62 V92 H66 V62 L68 84 L75 86 L81 60 L67 46 Q50 54 33 46 Z", "M50 52 V92"] },
  { id: "trousers", slot: "bottom", paths: ["M35 90 H65 L63 138 H52 L50 102 L48 138 H37 Z"] },
  { id: "skirt", slot: "bottom", paths: ["M35 90 H65 L73 120 H27 Z"] },
  { id: "sneakers", slot: "feet", paths: ["M32 139 H50 V146 H29 Z", "M50 139 H67 V146 H71 Z"] },
  { id: "backpack", slot: "extra", paths: ["M66 50 H82 V86 H66"] },
  { id: "scarf", slot: "extra", paths: ["M38 42 Q50 52 62 42 L60 52 Q50 58 40 52 Z"] },
  { id: "watch", slot: "extra", paths: ["M22 80 H30 V86 H22 Z"] }
];

export type SimOutfit = Partial<Record<SimSlot, string>>;

function storageKey(userId: string) {
  return `open-abundance-sim-outfit:${userId}`;
}

export function readSimOutfit(userId: string | null | undefined): SimOutfit {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const outfit: SimOutfit = {};
    for (const slot of SIM_SLOTS) {
      const id = value[slot];
      if (typeof id === "string" && SIM_CLOTHES.some((item) => item.id === id && item.slot === slot)) outfit[slot] = id;
    }
    return outfit;
  } catch {
    return {};
  }
}

export function storeSimOutfit(userId: string, outfit: SimOutfit): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(outfit));
  } catch {
    // The outfit is a convenience; it is simply not remembered when storage is unavailable.
  }
}
