"use client";

import { useEffect, useRef, useState } from "react";
import { rememberAcquisitionSource } from "@/lib/acquisition";
import { capturePendingReferral, isValidReferralCode } from "@/lib/guestIdentity";
import { ONBOARDING_SEEN_STORAGE_KEY } from "@/lib/onboardingContent";
import { getBrowserSupabaseClient, verifyEmailOtp } from "@/lib/supabaseClient";

const TELEGRAM_SCRIPT = "https://telegram.org/js/telegram-web-app.js";
// Start parameter of a one-time "link Telegram to my account" link from the profile (lib/telegramInitData.ts).
const LINK_PREFIX = "lnk_";

type TelegramWebApp = { initData?: string; ready?: () => void; expand?: () => void };
type Step = "choice" | "email" | "code";
type Texts = typeof TEXTS.en;

/**
 * An extra entry: the app opened as a Telegram Mini App (t.me/<bot>/<app>?startapp=<referral code>).
 * Telegram passes signed data in the URL fragment. A Telegram account that is already known opens its
 * account at once; a new one sees one screen instead of the onboarding: continue in one tap (new account)
 * or "I already have an account" (email code, then this Telegram is linked to it). Outside Telegram it does nothing.
 */
export default function TelegramMiniApp() {
  const [step, setStep] = useState<Step | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [text, setText] = useState<Texts>(TEXTS.en);
  const initDataRef = useRef<string | null>(null);

  useEffect(() => {
    const launch = readLaunchData();
    if (!launch) return;
    let cancelled = false;
    const texts = /^ru/i.test(launch.languageCode ?? navigator.language) ? TEXTS.ru : TEXTS.en;
    setText(texts);
    // The Mini App skips the onboarding slides: the choice below replaces them.
    try {
      window.localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
    } catch {
      // Without storage the onboarding may show once; the entry still works.
    }

    void (async () => {
      const webApp = await loadTelegramScript();
      webApp?.ready?.();
      webApp?.expand?.();
      const initData = webApp?.initData || launch.initData;
      initDataRef.current = initData;

      const linking = Boolean(launch.startParam?.startsWith(LINK_PREFIX));
      if (!linking) rememberAcquisitionSource("telegram", "mini_app", launch.startParam ?? undefined);
      if (!linking && launch.startParam && isValidReferralCode(launch.startParam)) {
        // Before sign-in: the registration claim on SIGNED_IN picks the referral up.
        await capturePendingReferral(launch.startParam, "/tg").catch(() => undefined);
      }

      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        // A link always signs in again: the Mini App may hold a session of a separate Telegram account.
        if ((session && !linking) || cancelled || !initData) return;
        const payload = await telegramSignIn(initData);
        if (cancelled) return;
        if (payload.needsChoice) {
          setName(payload.firstName ?? null);
          setStep("choice");
          return;
        }
        if (!payload.tokenHash) {
          if (linking) window.alert(linkErrorText(payload.code, texts));
          return;
        }
        if (session) await supabase.auth.signOut({ scope: "local" });
        await supabase.auth.verifyOtp({ token_hash: payload.tokenHash, type: "magiclink" });
      } catch (signInError) {
        // The app still works as a guest; sign-in by email stays available.
        console.warn("Telegram sign-in failed", signInError);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!step) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : text.failed);
    } finally {
      setBusy(false);
    }
  }

  const createAccount = () => run(async () => {
    const payload = await telegramSignIn(initDataRef.current ?? "", "create");
    if (!payload.tokenHash) throw new Error(text.failed);
    await getBrowserSupabaseClient().auth.verifyOtp({ token_hash: payload.tokenHash, type: "magiclink" });
    setStep(null);
  });

  const sendCode = () => run(async () => {
    // Existing accounts only: a new email here would make a second account instead of linking.
    const { error } = await getBrowserSupabaseClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) throw new Error(/signup|not allowed|not found/i.test(error.message) ? text.noAccount : error.message);
    setStep("code");
  });

  const confirmCode = () => run(async () => {
    await verifyEmailOtp(email, code);
    const { data: { session } } = await getBrowserSupabaseClient().auth.getSession();
    const response = await fetch("/api/auth/telegram/attach", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ initData: initDataRef.current })
    });
    const payload = await response.json() as { code?: string };
    // Signed in either way; without the link the next Telegram launch asks again.
    if (!response.ok) window.alert(linkErrorText(payload.code, text));
    setStep(null);
  });

  return (
    <div className="tg-entry-overlay" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="tg-entry-card">
        <h2>{text.title}</h2>
        {step === "choice" ? (
          <>
            <p>{text.choiceHint}</p>
            <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void createAccount()}>
              {name ? text.continueAs.replace("{name}", name) : text.continueNew}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => { setMessage(null); setStep("email"); }}>{text.haveAccount}</button>
          </>
        ) : null}
        {step === "email" ? (
          <>
            <p>{text.emailHint}</p>
            <label className="finance-field">
              <span>Email</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="challenge-primary-action" type="button" disabled={busy || !email.includes("@")} onClick={() => void sendCode()}>{text.sendCode}</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setStep("choice")}>{text.back}</button>
          </>
        ) : null}
        {step === "code" ? (
          <>
            <p>{text.codeHint.replace("{email}", email.trim())}</p>
            <label className="finance-field">
              <span>{text.code}</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <button className="challenge-primary-action" type="button" disabled={busy || code.trim().length < 6} onClick={() => void confirmCode()}>{text.signIn}</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setStep("email")}>{text.back}</button>
          </>
        ) : null}
        {message ? <p className="finance-error inline" role="status">{message}</p> : null}
      </div>
    </div>
  );
}

async function telegramSignIn(initData: string, mode?: "create"): Promise<{ tokenHash?: string; needsChoice?: boolean; firstName?: string | null; code?: string }> {
  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, mode })
  });
  const payload = await response.json() as { tokenHash?: string; needsChoice?: boolean; firstName?: string | null; code?: string };
  return response.ok ? payload : { code: payload.code };
}

function readLaunchData(): { initData: string | null; startParam: string | null; languageCode: string | null } | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  const initData = hash.get("tgWebAppData");
  if (!initData && !search.get("tgWebAppStartParam")) return null;
  const data = initData ? new URLSearchParams(initData) : null;
  const startParam = search.get("tgWebAppStartParam") ?? data?.get("start_param") ?? null;
  let languageCode: string | null = null;
  try {
    languageCode = (JSON.parse(data?.get("user") ?? "{}") as { language_code?: string }).language_code ?? null;
  } catch {
    languageCode = null;
  }
  return { initData, startParam: startParam?.trim() || null, languageCode };
}

function loadTelegramScript(): Promise<TelegramWebApp | null> {
  const current = () => (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
  if (current()) return Promise.resolve(current());
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_SCRIPT;
    script.async = true;
    script.onload = () => resolve(current());
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
    window.setTimeout(() => resolve(current()), 4000);
  });
}

function linkErrorText(code: string | undefined, text: Texts): string {
  if (code === "telegram_account_has_data") return text.hasData;
  if (code === "telegram_linked_elsewhere") return text.elsewhere;
  return text.linkFailed;
}

// This component runs outside the user context (before sign-in), so it keeps its own short texts.
const TEXTS = {
  en: {
    title: "Open Abundance",
    choiceHint: "Start in one tap with your Telegram name and photo, or sign in to the account you already have.",
    continueAs: "Continue as {name}",
    continueNew: "Continue with Telegram",
    haveAccount: "I already have an account",
    emailHint: "Enter the email of your account (for a Google account, its Gmail). We will send a code, and this Telegram will open that account from now on.",
    sendCode: "Send code",
    codeHint: "Enter the code from the email sent to {email}.",
    code: "Code",
    signIn: "Sign in",
    back: "Back",
    noAccount: "No account with this email. Go back and continue with Telegram.",
    failed: "Something went wrong. Try again.",
    hasData: "This Telegram already has its own Open Abundance account with data. Accounts are not merged automatically; write to us via Contact.",
    elsewhere: "This Telegram is already linked to another account.",
    linkFailed: "Could not link Telegram. The link works for 30 minutes: make a new one in your profile."
  },
  ru: {
    title: "Open Abundance",
    choiceHint: "Начните в одно касание с именем и фото из Telegram или войдите в аккаунт, который у вас уже есть.",
    continueAs: "Продолжить как {name}",
    continueNew: "Продолжить через Telegram",
    haveAccount: "У меня уже есть аккаунт",
    emailHint: "Введите почту вашего аккаунта (если входили через Google — его Gmail). Пришлём код, и дальше этот Telegram будет открывать ваш аккаунт.",
    sendCode: "Прислать код",
    codeHint: "Введите код из письма на {email}.",
    code: "Код",
    signIn: "Войти",
    back: "Назад",
    noAccount: "Аккаунта с такой почтой нет. Вернитесь и продолжите через Telegram.",
    failed: "Что-то пошло не так. Попробуйте ещё раз.",
    hasData: "У этого Telegram уже есть свой аккаунт Open Abundance с данными. Аккаунты не объединяются автоматически, напишите нам через «Контакты».",
    elsewhere: "Этот Telegram уже привязан к другому аккаунту.",
    linkFailed: "Не удалось привязать Telegram. Ссылка действует 30 минут: создайте новую в профиле."
  }
};
