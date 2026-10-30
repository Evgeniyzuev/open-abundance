"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Sheet from "@/components/ui/Sheet";
import { Confetti } from "@/components/ui/Celebration";
import { playUiSound } from "@/lib/ui/sound";
import { capturePendingDuo } from "@/lib/duoInvite";
import { recoverFromStaleChunks } from "@/components/ChunkErrorReload";
import { claimReferralAfterAuth, claimRegistrationAfterAuth, getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { Tables } from "@/lib/database.types";
import { capturePendingReferral, getOrCreateLocalGuest, markLocalGuestClaimed, markPendingReferralClaimed } from "@/lib/guestIdentity";
import { detectPreferredLocale, localeDirection, loadMessages, normalizeLocale, storeLocalePreference, translate, type AppLocale, type MessageKey } from "@/lib/i18n";
import { getOnboardingRegistrationLocale } from "@/lib/onboardingContent";
import { captureAcquisitionContext, readAcquisitionContext } from "@/lib/acquisition";
import {
  DEFAULT_ACCENT_THEME,
  DEFAULT_COLOR_THEME,
  DEFAULT_UI_SCALE,
  applyAppearancePreference,
  detectAppearancePreference,
  storeAccentTheme,
  storeColorTheme,
  storeUiScale,
  type AccentTheme,
  type ColorTheme,
  type UiScale
} from "@/lib/appearance";
import {
  DEFAULT_DISPLAY_CURRENCY,
  areExchangeRatesFresh,
  detectDisplayCurrencyPreference,
  exchangeRateFor,
  normalizeDisplayCurrency,
  normalizeExchangeRatesSnapshot,
  readCachedExchangeRates,
  storeCachedExchangeRates,
  storeDisplayCurrencyPreference,
  type DisplayCurrency,
  type ExchangeRatesSnapshot
} from "@/lib/displayCurrency";
import { createMoneyFormatter, type MoneyFormatter } from "@/lib/moneyFormat";

export type UserProfile = Tables<"user_profiles">;
export type CoreAccount = Tables<"core_accounts"> & {
  next_level_threshold?: number | null;
};
export type WalletAccount = Tables<"wallet_accounts">;

type UserContextValue = {
  user: User | null;
  profile: UserProfile | null;
  core: CoreAccount | null;
  wallet: WalletAccount | null;
  authResolved: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  locale: AppLocale;
  displayCurrency: DisplayCurrency;
  effectiveDisplayCurrency: DisplayCurrency;
  exchangeRates: ExchangeRatesSnapshot | null;
  exchangeRatesError: string | null;
  exchangeRatesLoading: boolean;
  exchangeRatesStale: boolean;
  money: MoneyFormatter;
  uiScale: UiScale;
  colorTheme: ColorTheme;
  accentTheme: AccentTheme;
  refreshUserData: () => Promise<void>;
  /** Holds the level-up dialog while another receipt (e.g. the registration reward) is on screen. */
  holdLevelUps: (hold: boolean) => void;
  applyServerData: (data: Partial<UserContextResponse>) => void;
  setLocale: (nextLocale: AppLocale) => Promise<void>;
  setDisplayCurrency: (nextCurrency: DisplayCurrency) => void;
  setUiScale: (nextScale: UiScale) => void;
  setColorTheme: (nextTheme: ColorTheme) => void;
  setAccentTheme: (nextTheme: AccentTheme) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

type UserContextResponse = {
  user: User | null;
  profile: UserProfile | null;
  core: CoreAccount | null;
  wallet: WalletAccount | null;
  error?: string;
};

const SERVER_FETCH_TIMEOUT_MS = 12_000;

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [core, setCore] = useState<CoreAccount | null>(null);
  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLevelUps, setPendingLevelUps] = useState<number[]>([]);
  const [levelUpsHeld, setLevelUpsHeld] = useState(false);
  // Detected up front (not after mount) so a Russian visitor downloads only the Russian dictionary. The first render is a spinner either way.
  const [guestLocale, setGuestLocale] = useState<AppLocale>(() => (typeof window === "undefined" ? "en" : detectPreferredLocale()));
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(DEFAULT_DISPLAY_CURRENCY);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRatesSnapshot | null>(null);
  const [exchangeRatesError, setExchangeRatesError] = useState<string | null>(null);
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [currencyPreferenceHydrated, setCurrencyPreferenceHydrated] = useState(false);
  const [uiScale, setUiScaleState] = useState<UiScale>(DEFAULT_UI_SCALE);
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(DEFAULT_ACCENT_THEME);
  const [appearanceHydrated, setAppearanceHydrated] = useState(false);
  const refreshRequestIdRef = useRef(0);
  const lastRefreshDoneAtRef = useRef(0);
  const serverDataVersionRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const currentLocaleRef = useRef<AppLocale>("en");
  const claimInFlightRef = useRef<Promise<void> | null>(null);
  const exchangeRatesInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setGuestLocale(detectPreferredLocale());
  }, []);

  useEffect(() => {
    setDisplayCurrencyState(detectDisplayCurrencyPreference());
    setExchangeRates(readCachedExchangeRates());
    setCurrencyPreferenceHydrated(true);
  }, []);

  useEffect(() => {
    const appearance = detectAppearancePreference();
    setUiScaleState(appearance.uiScale);
    setColorThemeState(appearance.colorTheme);
    setAccentThemeState(appearance.accentTheme);
    setAppearanceHydrated(true);
  }, []);

  useEffect(() => {
    if (!appearanceHydrated) return;
    applyAppearancePreference(uiScale, colorTheme, accentTheme);
    if (colorTheme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyAppearancePreference(uiScale, colorTheme, accentTheme);
    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [accentTheme, appearanceHydrated, colorTheme, uiScale]);

  useEffect(() => {
    captureAcquisitionContext();
    const params = new URLSearchParams(window.location.search);
    capturePendingDuo(params);
    const referralCode = params.get("ref");
    if (!referralCode) return;

    capturePendingReferral(referralCode, `${window.location.pathname}${window.location.search}`)
      .then(() => {
        params.delete("ref");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", nextUrl);
      })
      .catch((referralError) => {
        console.warn("Failed to capture referral code.", referralError);
      });
  }, []);

  const locale = normalizeLocale(profile?.default_locale ?? guestLocale);
  currentLocaleRef.current = locale;

  const refreshExchangeRates = useCallback(async () => {
    if (exchangeRatesInFlightRef.current) return exchangeRatesInFlightRef.current;

    exchangeRatesInFlightRef.current = (async () => {
      setExchangeRatesLoading(true);
      setExchangeRatesError(null);
      try {
        const response = await fetch("/api/exchange-rates", { headers: { Accept: "application/json" } });
        const payload = normalizeExchangeRatesSnapshot(await response.json().catch(() => null));
        if (!response.ok || !payload) throw new Error("Exchange rates are temporarily unavailable.");
        storeCachedExchangeRates(payload);
        setExchangeRates(payload);
      } catch (rateError) {
        setExchangeRatesError(rateError instanceof Error ? rateError.message : "Exchange rates are temporarily unavailable.");
      } finally {
        setExchangeRatesLoading(false);
      }
    })().finally(() => {
      exchangeRatesInFlightRef.current = null;
    });

    return exchangeRatesInFlightRef.current;
  }, []);

  useEffect(() => {
    if (!currencyPreferenceHydrated || displayCurrency === "USD") return;

    const refreshIfStale = () => {
      if (!areExchangeRatesFresh(exchangeRates)) void refreshExchangeRates();
    };
    refreshIfStale();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [currencyPreferenceHydrated, displayCurrency, exchangeRates, refreshExchangeRates]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const clearServerData = useCallback(() => {
    serverDataVersionRef.current += 1;
    setUser(null);
    setProfile(null);
    setCore(null);
    setWallet(null);
  }, []);

  const refreshUserDataRun = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1;
    const serverDataVersionAtStart = serverDataVersionRef.current;
    refreshRequestIdRef.current = requestId;
    setRefreshing(true);
    setError(null);

    try {
      if (isOffline()) {
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        if (isLatestRefresh(requestId, refreshRequestIdRef)) clearServerData();
        return;
      }

      const response = await fetchWithTimeout(`/api/user/context?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as UserContextResponse;

      if (response.status === 401) {
        if (isLatestRefresh(requestId, refreshRequestIdRef)) {
          clearServerData();
          setError(payload.error ?? "Session expired. Sign in again.");
        }
        return;
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Failed to refresh user data.");
      }

      if (!isLatestRefresh(requestId, refreshRequestIdRef)) return;
      if (serverDataVersionAtStart !== serverDataVersionRef.current) return;
      if (payload.user?.id && currentUserIdRef.current && payload.user.id !== currentUserIdRef.current) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Ignoring user context for a different user.", {
            currentUserId: currentUserIdRef.current,
            payloadUserId: payload.user.id
          });
        }
        return;
      }

      setUser(payload.user);
      setProfile(payload.profile);
      setCore(payload.core);
      setWallet(payload.wallet);
      lastRefreshDoneAtRef.current = Date.now();
    } catch (refreshError) {
      if (isLatestRefresh(requestId, refreshRequestIdRef)) {
        const timedOut = refreshError instanceof DOMException && (refreshError.name === "AbortError" || refreshError.name === "TimeoutError");
        // A slow server must not paint a raw browser message over data that is already on screen.
        if (timedOut) {
          if (!currentUserIdRef.current) setError("The server is slow to respond. Try again in a moment.");
        } else {
          setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh user data.");
        }
      }
    } finally {
      if (isLatestRefresh(requestId, refreshRequestIdRef)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [clearServerData]);

  const refreshInFlightRef = useRef<{ promise: Promise<void>; startedAt: number } | null>(null);
  // Callers that fire in the same instant (bootstrap, auth events) share one request; later calls always fetch fresh data.
  const refreshUserData = useCallback((): Promise<void> => {
    const current = refreshInFlightRef.current;
    if (current && Date.now() - current.startedAt < 300) return current.promise;
    const promise: Promise<void> = refreshUserDataRun().finally(() => {
      if (refreshInFlightRef.current?.promise === promise) refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = { promise, startedAt: Date.now() };
    return promise;
  }, [refreshUserDataRun]);

  const applyServerData = useCallback((data: Partial<UserContextResponse>) => {
    serverDataVersionRef.current += 1;
    if ("user" in data) setUser(data.user ?? null);
    if ("profile" in data) setProfile(data.profile ?? null);
    if ("core" in data) setCore(data.core ?? null);
    if ("wallet" in data) setWallet(data.wallet ?? null);
  }, []);

  const claimCurrentUserIfNeeded = useCallback(async () => {
    if (claimInFlightRef.current) return claimInFlightRef.current;

    claimInFlightRef.current = (async () => {
      const guest = await getOrCreateLocalGuest();
      let claimedUserId = guest.claimedUserId;

      if (!claimedUserId) {
        const claim = await claimRegistrationAfterAuth(getOnboardingRegistrationLocale(), {
          anonymousId: guest.guestId,
          ...readAcquisitionContext(),
          referralCode: guest.pendingReferral?.referralCode
        });
        claimedUserId = claim.userId;
        await markLocalGuestClaimed(claim.userId);
      }

      const pendingReferral = claimedUserId === currentUserIdRef.current
        ? guest.pendingReferral
        : undefined;

      await claimReferralAfterAuth(pendingReferral, guest.guestId);
      if (pendingReferral && !pendingReferral.claimedAt) {
        await markPendingReferralClaimed();
      }
    })().finally(() => {
      claimInFlightRef.current = null;
    });

    return claimInFlightRef.current;
  }, []);

  useEffect(() => {
    let mounted = true;
    let supabase: ReturnType<typeof getBrowserSupabaseClient>;

    try {
      supabase = getBrowserSupabaseClient();
    } catch (bootstrapError) {
      console.warn("User bootstrap failed", bootstrapError);
      setAuthResolved(true);
      setError(bootstrapError instanceof Error ? bootstrapError.message : "User bootstrap failed.");
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function bootstrapUser() {
      if (isOffline()) {
        if (mounted) {
          clearServerData();
          setAuthResolved(true);
          setLoading(false);
        }
        return;
      }

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!mounted) return;

      if (session?.user) {
        currentUserIdRef.current = session.user.id;
        setUser(session.user);
      }
      setAuthResolved(true);

      if (session) {
        // A failed referral/registration claim retries on the next load; it must not keep Core and Wallet from loading.
        await claimCurrentUserIfNeeded().catch((claimError) => {
          console.warn("Registration claim failed", claimError);
        });
      }

      if (mounted) await refreshUserData();
    }

    bootstrapUser().catch((bootstrapError) => {
      console.warn("User bootstrap failed", bootstrapError);
      if (mounted) {
        setAuthResolved(true);
        setError(bootstrapError instanceof Error ? bootstrapError.message : "User bootstrap failed.");
        setLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        currentUserIdRef.current = session.user.id;
        setUser(session.user);
      }
      setAuthResolved(true);

      if (event === "SIGNED_IN") {
        claimCurrentUserIfNeeded()
          .then(() => {
            // Supabase emits SIGNED_IN on every page load and tab focus; skip it when user data was successfully loaded a moment ago.
            if (Date.now() - lastRefreshDoneAtRef.current < 3000) return;
            return refreshUserData();
          })
          .catch((claimError) => {
            console.warn("Registration claim failed", claimError);
            setError(claimError instanceof Error ? claimError.message : "Registration claim failed.");
          });
      }

      if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setCore(null);
        setWallet(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [claimCurrentUserIfNeeded, clearServerData, refreshUserData]);

  useEffect(() => {
    const refreshAfterReconnect = () => {
      refreshUserData().catch((refreshError) => {
        console.warn("User reconnect refresh failed", refreshError);
      });
    };

    window.addEventListener("online", refreshAfterReconnect);
    return () => window.removeEventListener("online", refreshAfterReconnect);
  }, [refreshUserData]);

  useEffect(() => {
    if (!core || core.level <= core.last_seen_level) {
      setPendingLevelUps([]);
      return;
    }

    // Every new level is celebrated, level 1 included; it waits until the registration receipt is closed.
    const levels = Array.from({ length: core.level - core.last_seen_level }, (_, index) => core.last_seen_level + index + 1);
    setPendingLevelUps(levels);
  }, [core]);

  function acknowledgeLevelUp(level: number) {
    const supabase = getBrowserSupabaseClient();

    setPendingLevelUps((levels) => levels.filter((item) => item > level));
    setCore((current) => current ? { ...current, last_seen_level: Math.max(current.last_seen_level, Math.min(level, current.level)) } : current);

    try {
      supabase.auth.getSession()
        .then(async ({ data: { session }, error: sessionError }) => {
          if (sessionError) throw sessionError;
          if (!session?.access_token) throw new Error("Supabase session is missing.");

          const response = await fetch("/api/core/level-seen", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ level })
          });
          const payload = (await response.json()) as { error?: string };

          if (!response.ok || payload.error) {
            throw new Error(payload.error ?? "Failed to mark level as seen.");
          }

          await refreshUserData();
        })
        .catch((levelError) => {
          console.warn("Failed to mark level-up as seen.", levelError);
        });
    } catch (levelError) {
      console.warn("Failed to mark level-up as seen.", levelError);
    }
  }

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    const normalizedLocale = normalizeLocale(nextLocale);
    const previousLocale = currentLocaleRef.current;
    const previousProfile = profile;

    storeLocalePreference(normalizedLocale);
    setGuestLocale(normalizedLocale);
    setProfile((current) => current ? { ...current, default_locale: normalizedLocale } : current);

    if (!user) return;

    try {
      const supabase = getBrowserSupabaseClient();
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Supabase session is missing.");

      const response = await fetch("/api/user/locale", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ locale: normalizedLocale })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update language.");

      await refreshUserData();
    } catch (localeError) {
      storeLocalePreference(previousLocale);
      setGuestLocale(previousLocale);
      setProfile(previousProfile);
      setError(localeError instanceof Error ? localeError.message : "Failed to update language.");
      throw localeError;
    }
  }, [profile, refreshUserData, user]);

  const setDisplayCurrency = useCallback((nextCurrency: DisplayCurrency) => {
    const normalizedCurrency = normalizeDisplayCurrency(nextCurrency);
    storeDisplayCurrencyPreference(normalizedCurrency);
    setDisplayCurrencyState(normalizedCurrency);
  }, []);

  const setUiScale = useCallback((nextScale: UiScale) => {
    storeUiScale(nextScale);
    setUiScaleState(nextScale);
  }, []);

  const setColorTheme = useCallback((nextTheme: ColorTheme) => {
    storeColorTheme(nextTheme);
    setColorThemeState(nextTheme);
  }, []);

  const setAccentTheme = useCallback((nextTheme: AccentTheme) => {
    storeAccentTheme(nextTheme);
    setAccentThemeState(nextTheme);
  }, []);

  // The dictionary of each language is a separate chunk. The UI keeps the previous language until the new one has arrived.
  // A failed load is retried once; then the stale shell cache is dropped and the page reloads (an old shell after a
  // deploy asks for a dictionary chunk the server no longer has). Before, the app kept spinning until reopened.
  const [dictionaryLocale, setDictionaryLocale] = useState<AppLocale | null>(null);
  const [dictionaryFailed, setDictionaryFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    const load = (attempt: number) => {
      loadMessages(locale)
        .then(() => { if (!cancelled) setDictionaryLocale(locale); })
        .catch(async (dictionaryError) => {
          console.warn("Language dictionary failed to load", dictionaryError);
          if (cancelled) return;
          if (attempt === 0) {
            retryTimer = window.setTimeout(() => load(1), 800);
            return;
          }
          if (!dictionaryLocale && !(await recoverFromStaleChunks()) && !cancelled) setDictionaryFailed(true);
        });
    };
    load(0);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
    // dictionaryLocale is read only to know whether some language is already shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(dictionaryLocale ?? locale, key, values),
    [dictionaryLocale, locale]
  );

  const displayRate = exchangeRateFor(exchangeRates, displayCurrency);
  const effectiveDisplayCurrency = displayRate ? displayCurrency : DEFAULT_DISPLAY_CURRENCY;
  const money = useMemo(
    () => createMoneyFormatter(locale, effectiveDisplayCurrency, displayRate ?? 1),
    [displayRate, effectiveDisplayCurrency, locale]
  );
  const exchangeRatesStale = Boolean(exchangeRates) && !areExchangeRatesFresh(exchangeRates);

  const value = useMemo(
    () => ({
      user,
      profile,
      core,
      wallet,
      authResolved,
      loading,
      refreshing,
      error,
      locale,
      displayCurrency,
      effectiveDisplayCurrency,
      exchangeRates,
      exchangeRatesError,
      exchangeRatesLoading,
      exchangeRatesStale,
      money,
      uiScale,
      colorTheme,
      accentTheme,
      refreshUserData,
      holdLevelUps: setLevelUpsHeld,
      applyServerData,
      setLocale,
      setDisplayCurrency,
      setUiScale,
      setColorTheme,
      setAccentTheme,
      t
    }),
    [accentTheme, applyServerData, authResolved, colorTheme, core, displayCurrency, effectiveDisplayCurrency, error, exchangeRates, exchangeRatesError, exchangeRatesLoading, exchangeRatesStale, loading, locale, money, profile, refreshUserData, refreshing, setAccentTheme, setColorTheme, setDisplayCurrency, setLocale, setUiScale, t, uiScale, user, wallet]
  );

  return (
    <UserContext.Provider value={value}>
      {dictionaryLocale ? children : <DictionaryWait failed={dictionaryFailed} locale={locale} />}
      {pendingLevelUps[0] && !levelUpsHeld ? (
        <LevelUpModal
          level={pendingLevelUps[0]}
          onClose={() => acknowledgeLevelUp(pendingLevelUps[0])}
          t={t}
        />
      ) : null}
    </UserContext.Provider>
  );
}

export function useUserContext(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error("useUserContext must be used inside UserProvider.");
  return value;
}

export function useMoneyFormatter(): MoneyFormatter {
  return useUserContext().money;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isLatestRefresh(requestId: number, ref: { current: number }): boolean {
  return requestId === ref.current;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT_MS);

  try {
    return await fetchWithSupabaseAuth(input, { ...init, signal: controller.signal }, { authRequired: true });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function LevelUpModal({
  level,
  onClose,
  t
}: {
  level: number;
  onClose: () => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  useEffect(() => { playUiSound("levelUp"); }, [level]);
  return (
    <Sheet bare dismissible={false} className="small level-up-modal" ariaLabel={t("levelUp.title")}>
        <Confetti pieces={30} />
        <img className="level-up-art" alt="" src="/milestones/level-up.webp" />
        <span className="level-up-badge">Lvl {level}</span>
        <h2>{t("levelUp.title")}</h2>
        <p>{t("levelUp.description", { level })}</p>
        <button className="challenge-primary-action" type="button" onClick={onClose}>
          {t("app.common.excellent")}
        </button>
    </Sheet>
  );
}

/**
 * Shown before any language has arrived, so its words cannot come from the dictionaries. The restart link appears
 * through a CSS delay, so it shows up even when the page's scripts never started; at once when loading failed.
 */
function DictionaryWait({ failed, locale }: { failed: boolean; locale: AppLocale }) {
  return (
    <main aria-busy={!failed} className="startup-recovery-screen">
      <section className="startup-recovery-card" aria-live="polite">
        <span className="startup-recovery-spinner" aria-hidden="true" />
        <a className={failed ? "startup-recovery-restart shown" : "startup-recovery-restart"} href="/">↻ {RESTART_LABELS[locale] ?? RESTART_LABELS.en}</a>
      </section>
    </main>
  );
}

const RESTART_LABELS: Record<AppLocale, string> = {
  ru: "Перезапустить",
  en: "Restart",
  zh: "重新启动",
  es: "Reiniciar",
  hi: "फिर से शुरू करें",
  ar: "إعادة التشغيل"
};

