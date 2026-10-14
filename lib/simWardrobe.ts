// Free wardrobe of the Future Sim avatar: simple clothes, one item per slot.
// Premium models (cars, houses, yachts) are paid items and live elsewhere; the outfit is stored locally for now
// and moves to the server when a showcase for other people is built.

export const SIM_SLOTS = ["head", "face", "top", "bottom", "feet", "extra", "home", "ride", "pet"] as const;
export type SimSlot = (typeof SIM_SLOTS)[number];

// Body slots draw on the 100x150 figure; scene slots (home, ride, pet) draw on the 300x150 scene and carry their own placement.
export const SIM_SCENE_SLOTS: readonly SimSlot[] = ["home", "ride", "pet"];

export type SimClothing = { id: string; slot: SimSlot; paths: string[]; place?: string };

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
  { id: "watch", slot: "extra", paths: ["M22 80 H30 V86 H22 Z"] },
  // Home: ground line is y=146 of the scene.
  { id: "tent", slot: "home", place: "translate(0 36)", paths: ["M6 110 L43 18 L80 110 Z", "M43 18 V110", "M34 110 L43 74 L52 110"] },
  { id: "house", slot: "home", place: "translate(0 36)", paths: ["M8 54 L43 14 L78 54", "M16 54 V110 H70 V54", "M38 110 V82 H50 V110", "M22 66 H32 V78 H22 Z", "M56 66 H64 V78 H56 Z", "M60 28 V16 H68 V36"] },
  { id: "flat", slot: "home", place: "translate(0 36)", paths: ["M14 110 V8 H72 V110 Z", "M24 20 H34 V30 H24 Z", "M52 20 H62 V30 H52 Z", "M24 44 H34 V54 H24 Z", "M52 44 H62 V54 H52 Z", "M24 68 H34 V78 H24 Z", "M52 68 H62 V78 H52 Z", "M38 110 V92 H48 V110"] },
  // Ride.
  { id: "bike", slot: "ride", place: "translate(208 104)", paths: ["M6 32 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", "M52 32 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", "M16 32 L34 14 H52 L62 32 M34 14 L40 32 H16", "M52 14 L56 8 H64", "M30 10 H40"] },
  { id: "scooter", slot: "ride", place: "translate(208 104)", paths: ["M10 36 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "M60 36 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "M17 36 H67", "M67 36 L60 6 H70"] },
  { id: "car", slot: "ride", place: "translate(208 104)", paths: ["M4 32 H88 V22 L72 20 L60 8 H32 L20 20 L4 22 Z", "M30 12 H44 V20 H26 Z", "M48 12 H58 L66 20 H48 Z", "M17 32 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", "M61 32 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0"] },
  // Pet.
  { id: "cat", slot: "pet", place: "translate(168 116)", paths: ["M6 30 C4 18 16 14 24 18 V30", "M18 12 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0", "M19 8 L20 2 L24 6", "M28 6 L31 2 L31 9", "M6 26 C-2 24 -2 14 4 10"] },
  { id: "dog", slot: "pet", place: "translate(168 116)", paths: ["M4 16 H26 V26 H4 Z", "M8 26 V30 M22 26 V30", "M25 12 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0", "M28 4 L26 10", "M4 18 L0 10"] },
  { id: "bird", slot: "pet", place: "translate(168 116)", paths: ["M6 22 a10 7 0 1 0 20 0 a10 7 0 1 0 -20 0", "M26 20 L32 22 L26 24", "M12 29 V34 M20 29 V34", "M6 20 L0 16"] }
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

// Poses: the figure strikes one by hand (for photos) or follows the day ("auto": cheers when all tasks are done).
export const SIM_POSES = ["auto", "stand", "wave", "cheer"] as const;
export type SimPose = (typeof SIM_POSES)[number];

export const SIM_ARMS: Record<Exclude<SimPose, "auto">, string> = {
  stand: "M34 48 L24 84 M66 48 L76 84",
  wave: "M34 48 L24 84 M66 48 L80 30",
  cheer: "M34 48 L24 26 M66 48 L76 26"
};

export function effectivePose(pose: SimPose, mood: string): Exclude<SimPose, "auto"> {
  if (pose !== "auto") return pose;
  return mood === "celebrate" ? "cheer" : "stand";
}

export function readSimPose(userId: string | null | undefined): SimPose {
  if (!userId || typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(`open-abundance-sim-pose:${userId}`);
    return SIM_POSES.includes(value as SimPose) ? (value as SimPose) : "auto";
  } catch {
    return "auto";
  }
}

export function storeSimPose(userId: string, pose: SimPose): void {
  try {
    window.localStorage.setItem(`open-abundance-sim-pose:${userId}`, pose);
  } catch {
    // Not remembered when storage is unavailable.
  }
}

// Shelf: up to five owned sacred items shown under the scene. Stored as the catalog keys of the items.
export const SIM_SHELF_MAX = 5;

export function sanitizeShelf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string" && key.length > 0 && key.length < 60).slice(0, SIM_SHELF_MAX)
    : [];
}

export function readSimShelf(userId: string | null | undefined): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`open-abundance-sim-shelf:${userId}`);
    return raw ? sanitizeShelf(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function storeSimShelf(userId: string, shelf: string[]): void {
  try {
    window.localStorage.setItem(`open-abundance-sim-shelf:${userId}`, JSON.stringify(sanitizeShelf(shelf)));
  } catch {
    // Not remembered when storage is unavailable.
  }
}
