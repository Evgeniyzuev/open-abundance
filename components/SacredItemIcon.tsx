// One line-art style for every sacred item: 64x64 box, currentColor strokes, no fills except star dots.
// Icons are keyed by the catalog item key (lib/sacredItems.ts); unknown keys fall back to the text glyph.

type Star = [number, number];

// Stylised constellations: each polyline is drawn as a thin line, every point as a small star.
const ZODIAC: Record<string, Star[][]> = {
  aries: [[[14, 40], [26, 30], [40, 26], [50, 32]]],
  taurus: [[[12, 18], [24, 32], [34, 38], [46, 34], [54, 20]], [[34, 38], [30, 52]]],
  gemini: [[[20, 12], [22, 34], [18, 52]], [[44, 12], [40, 34], [46, 52]], [[22, 34], [40, 34]]],
  cancer: [[[14, 14], [22, 20], [32, 32], [44, 22], [52, 24]], [[32, 32], [30, 50]]],
  leo: [[[20, 50], [18, 36], [24, 24], [34, 18], [42, 24], [38, 32], [50, 42], [54, 52]]],
  virgo: [[[14, 16], [24, 24], [32, 36], [44, 30], [52, 20]], [[32, 36], [30, 52]], [[24, 24], [22, 40]]],
  libra: [[[10, 44], [18, 34], [32, 28], [46, 34], [54, 44]], [[32, 28], [32, 14]]],
  scorpio: [[[12, 20], [22, 26], [30, 36], [36, 46], [46, 50], [54, 44], [50, 36]]],
  sagittarius: [[[12, 52], [50, 14]], [[40, 14], [50, 14], [50, 24]], [[22, 14], [30, 34], [50, 48]]],
  capricorn: [[[12, 18], [24, 30], [30, 44], [44, 48], [52, 38], [46, 30]]],
  aquarius: [[[10, 26], [20, 20], [30, 26], [40, 20], [50, 26], [56, 22]], [[10, 42], [20, 36], [30, 42], [40, 36], [50, 42], [56, 38]]],
  pisces: [[[14, 16], [22, 32], [14, 48]], [[50, 16], [42, 32], [50, 48]], [[22, 32], [42, 32]]]
};

// Other groups are plain path data.
const PATHS: Record<string, string[]> = {
  element_fire: ["M32 8 C34 20 48 26 48 40 A16 16 0 0 1 16 40 C16 32 22 28 24 20 C28 24 30 18 32 8 Z"],
  element_water: ["M32 8 C32 8 16 28 16 40 A16 16 0 0 0 48 40 C48 28 32 8 32 8 Z", "M24 40 A8 8 0 0 0 32 48"],
  element_earth: ["M8 52 L24 24 L34 40 L42 28 L56 52 Z", "M18 38 H30"],
  element_air: ["M10 24 H38 A6 6 0 1 0 32 18", "M10 34 H46 A7 7 0 1 1 39 41", "M10 44 H30 A5 5 0 1 1 25 49"],
  stone_amethyst: ["M32 8 L42 20 L40 52 L32 58 L24 52 L22 20 Z", "M22 20 L32 26 L42 20", "M32 26 V58"],
  stone_quartz: ["M32 6 L40 16 V50 L32 58 L24 50 V16 Z", "M24 16 H40", "M32 6 V16"],
  stone_obsidian: ["M20 54 L28 10 L36 24 L46 18 L44 54 Z", "M28 10 L30 54", "M36 24 L38 54"],
  stone_lapis: ["M32 12 A20 20 0 1 0 32.01 12 Z", "M22 30 Q32 22 42 30", "M24 42 Q32 48 40 42"],
  place_stonehenge: ["M12 52 V30", "M24 52 V30", "M40 52 V30", "M52 52 V30", "M8 30 H28", "M36 30 H56", "M6 52 H58"],
  place_sedona: ["M6 52 V40 H16 V28 H30 V40 H36 V22 H50 V36 H58 V52 Z"],
  place_uluru: ["M6 50 C10 28 22 22 32 22 C44 22 54 28 58 50 Z", "M20 38 C26 34 38 34 46 40"],
  place_machu_picchu: ["M6 54 H58", "M10 46 H54", "M16 38 H48", "M22 30 H42", "M26 22 L32 10 L38 22"],
  amulet_ankh: ["M32 29 V58", "M18 38 H46"],
  amulet_hamsa: ["M32 58 C22 58 17 50 17 42 L12 32 C11 29 14 27 16 30 L19 36 V20 C19 16 23 16 23 20 V28 V12 C23 8 27 8 27 12 V28 V8 C27 5 32 5 32 5", "M32 58 C42 58 47 50 47 42 L52 32 C53 29 50 27 48 30 L45 36 V20 C45 16 41 16 41 20 V28 V12 C41 8 37 8 37 12 V28 V8 C37 5 32 5 32 5"],
  amulet_eye: ["M6 32 C16 16 48 16 58 32 C48 48 16 48 6 32 Z"]
};

export default function SacredItemIcon({ itemKey, fallback, size = 56, x, y }: { itemKey?: string | null; fallback?: string; size?: number; x?: number; y?: number }) {
  const key = itemKey ?? "";
  const zodiac = key.startsWith("zodiac_") ? ZODIAC[key.slice(7)] : undefined;
  const paths = PATHS[key];
  if (!zodiac && !paths) return fallback ? <i style={{ fontStyle: "normal", fontSize: size * 0.8, lineHeight: 1 }}>{fallback}</i> : null;

  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {zodiac ? (
        <>
          {zodiac.map((line, index) => (
            <polyline key={index} points={line.map(([x, y]) => `${x},${y}`).join(" ")} strokeWidth="1.8" opacity="0.7" />
          ))}
          {zodiac.flat().map(([x, y], index) => <circle key={index} cx={x} cy={y} r="2.6" fill="currentColor" stroke="none" />)}
        </>
      ) : null}
      {paths?.map((d, index) => <path key={index} d={d} />)}
      {key === "amulet_ankh" ? <ellipse cx="32" cy="18" rx="10" ry="11" /> : null}
      {key === "amulet_hamsa" ? <circle cx="32" cy="40" r="4" /> : null}
      {key === "amulet_eye" ? <><circle cx="32" cy="32" r="9" /><circle cx="32" cy="32" r="3.2" fill="currentColor" stroke="none" /></> : null}
      {key === "stone_lapis" ? <><circle cx="26" cy="36" r="1.4" fill="currentColor" stroke="none" /><circle cx="38" cy="26" r="1.4" fill="currentColor" stroke="none" /><circle cx="40" cy="38" r="1.4" fill="currentColor" stroke="none" /></> : null}
    </svg>
  );
}
