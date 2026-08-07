export const UI_SCALES = ["100", "120", "140"] as const;
export type UiScale = (typeof UI_SCALES)[number];

export const COLOR_THEMES = ["system", "light", "dark"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const ACCENT_THEMES = ["gray", "blue", "green", "violet", "amber", "teal"] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const UI_SCALE_STORAGE_KEY = "openAbundanceUiScale";
export const COLOR_THEME_STORAGE_KEY = "openAbundanceColorTheme";
export const ACCENT_THEME_STORAGE_KEY = "openAbundanceAccentTheme";

export const DEFAULT_UI_SCALE: UiScale = "100";
export const DEFAULT_COLOR_THEME: ColorTheme = "system";
export const DEFAULT_ACCENT_THEME: AccentTheme = "gray";

export function normalizeUiScale(value: unknown): UiScale {
  return typeof value === "string" && UI_SCALES.includes(value as UiScale)
    ? (value as UiScale)
    : DEFAULT_UI_SCALE;
}

export function normalizeColorTheme(value: unknown): ColorTheme {
  return typeof value === "string" && COLOR_THEMES.includes(value as ColorTheme)
    ? (value as ColorTheme)
    : DEFAULT_COLOR_THEME;
}

export function normalizeAccentTheme(value: unknown): AccentTheme {
  return typeof value === "string" && ACCENT_THEMES.includes(value as AccentTheme)
    ? (value as AccentTheme)
    : DEFAULT_ACCENT_THEME;
}

export function detectAppearancePreference(): { uiScale: UiScale; colorTheme: ColorTheme; accentTheme: AccentTheme } {
  if (typeof window === "undefined") {
    return { uiScale: DEFAULT_UI_SCALE, colorTheme: DEFAULT_COLOR_THEME, accentTheme: DEFAULT_ACCENT_THEME };
  }

  try {
    return {
      uiScale: normalizeUiScale(window.localStorage.getItem(UI_SCALE_STORAGE_KEY)),
      colorTheme: normalizeColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY)),
      accentTheme: normalizeAccentTheme(window.localStorage.getItem(ACCENT_THEME_STORAGE_KEY))
    };
  } catch {
    return { uiScale: DEFAULT_UI_SCALE, colorTheme: DEFAULT_COLOR_THEME, accentTheme: DEFAULT_ACCENT_THEME };
  }
}

export function storeUiScale(uiScale: UiScale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, normalizeUiScale(uiScale));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function storeColorTheme(colorTheme: ColorTheme): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, normalizeColorTheme(colorTheme));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function storeAccentTheme(accentTheme: AccentTheme): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ACCENT_THEME_STORAGE_KEY, normalizeAccentTheme(accentTheme));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }
}

export function applyAppearancePreference(uiScale: UiScale, colorTheme: ColorTheme, accentTheme: AccentTheme): void {
  if (typeof document === "undefined") return;

  const normalizedScale = normalizeUiScale(uiScale);
  const normalizedTheme = normalizeColorTheme(colorTheme);
  const normalizedAccent = normalizeAccentTheme(accentTheme);
  const root = document.documentElement;

  root.dataset.uiScale = normalizedScale;
  root.dataset.theme = normalizedTheme;
  root.dataset.accent = normalizedAccent;
  root.style.colorScheme = resolveColorTheme(normalizedTheme);
  updateThemeColor(normalizedTheme, normalizedAccent);
}

export function resolveColorTheme(colorTheme: ColorTheme): "light" | "dark" {
  if (colorTheme === "dark") return "dark";
  if (colorTheme === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function updateThemeColor(colorTheme: ColorTheme, accentTheme: AccentTheme): void {
  const palette: Record<AccentTheme, { light: string; dark: string }> = {
    gray: { light: "#f2f2f7", dark: "#111318" },
    blue: { light: "#eef5fb", dark: "#0e151c" },
    green: { light: "#edf6f0", dark: "#101713" },
    violet: { light: "#f3f0fa", dark: "#14121b" },
    amber: { light: "#faf5ea", dark: "#19150f" },
    teal: { light: "#edf7f7", dark: "#0e1718" }
  };
  const themeColor = palette[accentTheme][resolveColorTheme(colorTheme)];
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => {
    meta.content = themeColor;
  });
}
