"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LogIn, Mail, Sparkles } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import {
  consumePostAuthReward,
  getBrowserSupabaseClient,
  requestEmailOtp,
  signInWithGoogle,
  verifyEmailOtp,
  type AuthMethod,
  type RegistrationReward
} from "@/lib/supabaseClient";
import {
  ONBOARDING_DRAFT_STORAGE_KEY,
  ONBOARDING_LOCALES,
  ONBOARDING_LOCALE_LABELS,
  ONBOARDING_SEEN_STORAGE_KEY,
  detectPreferredOnboardingLocale,
  normalizeOnboardingLocale,
  onboardingContent,
  onboardingText,
  storeOnboardingLocalePreference,
  type OnboardingLocale
} from "@/lib/onboardingContent";
import { trackProductEvent } from "@/lib/productAnalytics";

type StoryStepId = "mission" | "stories" | "program";
type StepId = StoryStepId | "auth" | "email";
type OnboardingState = Record<string, unknown> & {
  firstExperienceCompleted?: boolean;
  firstPlanDraft?: OnboardingDraft;
};
type OnboardingDraft = {
  dailyCoreTarget: number;
  effort: "light" | "steady" | "focused";
  estimatedDays: number | null;
  mainWish: string;
  targetCore: number;
};

const steps: StoryStepId[] = ["mission", "stories", "program"];
const PENDING_EMAIL_OTP_STORAGE_KEY = "openAbundancePendingEmailOtp";
const PENDING_EMAIL_OTP_TTL_MS = 15 * 60 * 1000;
const EMAIL_OTP_RESEND_SECONDS = 60;

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { applyServerData, authResolved, profile, t, user } = useUserContext();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [onboardingLocale, setOnboardingLocale] = useState<OnboardingLocale | null>(null);
  const [registrationReward, setRegistrationReward] = useState<RegistrationReward | null>(null);

  useEffect(() => {
    setOnboardingSeen(readOnboardingSeen());
    const reward = consumePostAuthReward();
    if (reward) {
      setRegistrationReward(reward);
      trackProductEvent("registration_reward_viewed", {
        account: reward.account,
        amount: reward.amount,
        version: "abundance_mission_v3"
      });
    }
  }, []);

  useEffect(() => {
    setOnboardingLocale(detectPreferredOnboardingLocale());
  }, []);

  const profileCompleted = hasCompletedFirstExperience(profile);

  useEffect(() => {
    if (!user || !profile || profileCompleted) return;
    const draft = readOnboardingDraft();
    void saveProfileCompletion(profile, applyServerData, draft);
  }, [applyServerData, profile, profileCompleted, user]);

  if (!authResolved || onboardingSeen === null) return null;

  if (!user) {
    if (onboardingLocale === null) return null;
    return (
      <OnboardingApp
        initialStep={onboardingSeen || isAuthScreenRequested() ? "auth" : "mission"}
        locale={onboardingLocale ?? "en"}
        onLocaleChange={async (nextLocale) => {
          storeOnboardingLocalePreference(nextLocale);
          setOnboardingLocale(nextLocale);
        }}
        onAuthScreenOpened={() => {
          markOnboardingSeen();
          setOnboardingSeen(true);
        }}
        onGoogleSignIn={async () => {
          await signInWithGoogle();
        }}
        onEmailOtpRequest={requestEmailOtp}
        onEmailOtpVerify={verifyEmailOtp}
      />
    );
  }

  return (
    <>
      {children}
      {registrationReward ? (
        <FirstRewardModal
          reward={registrationReward}
          t={t}
          onClose={() => {
            trackProductEvent("registration_reward_closed", {
              account: registrationReward.account,
              amount: registrationReward.amount,
              version: "abundance_mission_v3"
            });
            setRegistrationReward(null);
            openFeedAfterAuth();
          }}
        />
      ) : null}
    </>
  );
}

function OnboardingApp({
  initialStep,
  locale,
  onLocaleChange,
  onAuthScreenOpened,
  onEmailOtpRequest,
  onEmailOtpVerify,
  onGoogleSignIn,
}: {
  initialStep: StepId;
  locale: OnboardingLocale;
  onLocaleChange: (locale: OnboardingLocale) => Promise<void>;
  onAuthScreenOpened: () => void;
  onEmailOtpRequest: (email: string) => Promise<void>;
  onEmailOtpVerify: (email: string, token: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}) {
  const [step, setStep] = useState<StepId>(initialStep);
  const [activeAuthMethod, setActiveAuthMethod] = useState<AuthMethod | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailOtpSentTo, setEmailOtpSentTo] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const currentIndex = step === "auth" || step === "email" ? steps.length - 1 : steps.indexOf(step);

  useEffect(() => {
    trackProductEvent("onboarding_viewed", { locale, version: "abundance_mission_v3" });
  }, [locale]);

  useEffect(() => {
    const pendingOtp = readPendingEmailOtp();
    if (!pendingOtp) return;
    const elapsedSeconds = Math.floor((Date.now() - pendingOtp.sentAt) / 1000);
    setEmail(pendingOtp.email);
    setEmailOtpSentTo(pendingOtp.email);
    setResendSeconds(Math.max(0, EMAIL_OTP_RESEND_SECONDS - elapsedSeconds));
    setStep("email");
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timeoutId = window.setTimeout(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [resendSeconds]);

  function goTo(nextStep: StepId) {
    setActionError(null);
    setStep(nextStep);
    trackProductEvent("onboarding_step_viewed", { step: nextStep, version: "abundance_mission_v3" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openAuthScreen() {
    onAuthScreenOpened();
    goTo("auth");
  }

  async function handleGoogleSignIn() {
    setActiveAuthMethod("google");
    setActionError(null);
    trackProductEvent("onboarding_auth_started", { method: "google", retry: false, version: "abundance_mission_v3" });

    try {
      await onGoogleSignIn();
    } catch {
      setActionError(onboardingText(onboardingContent.errors.auth, locale));
      setActiveAuthMethod(null);
    }
  }

  async function handleEmailOtpRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setEmailOtpSentTo(null);

    if (!isValidEmail(normalizedEmail)) {
      setActionError(onboardingText(onboardingContent.errors.emailInvalid, locale));
      return;
    }

    await sendEmailOtp(normalizedEmail, false);
  }

  async function sendEmailOtp(address: string, retry: boolean) {
    setActiveAuthMethod("email");
    setActionError(null);
    trackProductEvent("onboarding_auth_started", { method: "email", retry, version: "abundance_mission_v3" });

    try {
      await onEmailOtpRequest(address);
      setEmailOtpSentTo(address);
      setEmailOtp("");
      setResendSeconds(EMAIL_OTP_RESEND_SECONDS);
      storePendingEmailOtp(address);
      trackProductEvent("onboarding_auth_email_sent", { method: "email", retry, version: "abundance_mission_v3" });
    } catch {
      setActionError(onboardingText(onboardingContent.errors.emailOtpSend, locale));
    } finally {
      setActiveAuthMethod(null);
    }
  }

  async function handleEmailOtpVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailOtpSentTo) return;

    if (!/^\d{6}$/.test(emailOtp)) {
      setActionError(onboardingText(onboardingContent.errors.emailOtpInvalid, locale));
      return;
    }

    setActiveAuthMethod("email");
    setActionError(null);
    trackProductEvent("onboarding_auth_email_verification_started", { method: "email", version: "abundance_mission_v3" });

    try {
      await onEmailOtpVerify(emailOtpSentTo, emailOtp);
      clearPendingEmailOtp();
      window.location.assign("/auth/callback?method=email");
    } catch {
      setActionError(onboardingText(onboardingContent.errors.emailOtpVerify, locale));
      setActiveAuthMethod(null);
    }
  }

  function changeEmail() {
    setEmailOtpSentTo(null);
    setEmailOtp("");
    setResendSeconds(0);
    setActionError(null);
    clearPendingEmailOtp();
  }

  const previousStep = step === "email" ? "auth" : step === "auth" ? "program" : currentIndex > 0 ? steps[currentIndex - 1] : null;

  return (
    <main className={`onboarding-screen onboarding-theme-${step}`}>
      <section className="onboarding-shell" aria-live="polite">
        <header className="onboarding-top">
          <div className="onboarding-brand-row">
            {previousStep ? (
              <button
                className="onboarding-back-button"
                type="button"
                aria-label={onboardingText(onboardingContent.actions.back, locale)}
                onClick={() => goTo(previousStep)}
              >
                <ArrowLeft size={19} />
              </button>
            ) : (
              <span className="onboarding-brand-mark" aria-hidden="true"><Sparkles size={17} /></span>
            )}
            <strong>{onboardingText(onboardingContent.brand, locale)}</strong>
          </div>
          <div className="onboarding-top-tools">
            <select
              className="onboarding-language-select"
              aria-label={onboardingText(onboardingContent.actions.language, locale)}
              value={locale}
              onChange={(event) => void onLocaleChange(normalizeOnboardingLocale(event.target.value))}
            >
              {ONBOARDING_LOCALES.map((item) => (
                <option key={item} value={item}>{ONBOARDING_LOCALE_LABELS[item]}</option>
              ))}
            </select>
            {step !== "auth" && step !== "email" ? (
              <div
                className="onboarding-progress"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={currentIndex + 1}
              >
                {steps.map((item) => (
                  <i className={steps.indexOf(item) <= currentIndex ? "active" : ""} key={item} />
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {step === "mission" ? (
          <section className="onboarding-slide">
            <OnboardingArtwork
              alt={onboardingText(onboardingContent.mission.imageAlt, locale)}
              priority
              src="/onboarding/ai-abundance-path.png"
            />
            <div className="onboarding-copy">
              <span>{onboardingText(onboardingContent.mission.eyebrow, locale)}</span>
              <h1>{onboardingText(onboardingContent.mission.title, locale)}</h1>
              <p>{onboardingText(onboardingContent.mission.body, locale)}</p>
            </div>
            <button className="onboarding-primary-action" type="button" onClick={() => goTo("stories")}>
              {onboardingText(onboardingContent.actions.continue, locale)}
              <ArrowRight size={18} />
            </button>
          </section>
        ) : null}

        {step === "stories" ? (
          <section className="onboarding-slide">
            <OnboardingArtwork
              alt={onboardingText(onboardingContent.stories.imageAlt, locale)}
              src="/onboarding/people-stories.png"
            />
            <div className="onboarding-copy">
              <span>{onboardingText(onboardingContent.stories.eyebrow, locale)}</span>
              <h1>{onboardingText(onboardingContent.stories.title, locale)}</h1>
              <p>{onboardingText(onboardingContent.stories.body, locale)}</p>
            </div>
            <button className="onboarding-primary-action" type="button" onClick={() => goTo("program")}>
              {onboardingText(onboardingContent.actions.viewStories, locale)}
              <ArrowRight size={18} />
            </button>
          </section>
        ) : null}

        {step === "program" ? (
          <section className="onboarding-slide onboarding-program-slide">
            <OnboardingArtwork
              alt={onboardingText(onboardingContent.program.imageAlt, locale)}
              src="/onboarding/twenty-levels.png"
            />
            <div className="onboarding-copy">
              <span>{onboardingText(onboardingContent.program.eyebrow, locale)}</span>
              <h1>{onboardingText(onboardingContent.program.title, locale)}</h1>
              <p>{onboardingText(onboardingContent.program.body, locale)}</p>
              <p className="onboarding-program-prompt">{onboardingText(onboardingContent.program.prompt, locale)}</p>
            </div>
            <div className="onboarding-final-actions">
              <button className="onboarding-primary-action" type="button" onClick={openAuthScreen}>
                {onboardingText(onboardingContent.actions.go, locale)}
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        ) : null}

        {step === "auth" ? (
          <section className="onboarding-slide onboarding-auth-slide">
            <div className="onboarding-copy onboarding-auth-copy">
              <span>{onboardingText(onboardingContent.auth.eyebrow, locale)}</span>
              <h1>{onboardingText(onboardingContent.auth.title, locale)}</h1>
              <p>{onboardingText(onboardingContent.auth.body, locale)}</p>
            </div>
            <div className="onboarding-auth-panel onboarding-auth-methods">
              <button
                className="onboarding-primary-action"
                type="button"
                disabled={activeAuthMethod !== null}
                onClick={() => void handleGoogleSignIn()}
              >
                <LogIn size={18} />
                {onboardingText(onboardingContent.actions.signInGoogle, locale)}
              </button>
              <button className="onboarding-secondary-action" type="button" onClick={() => goTo("email")}>
                <Mail size={18} />
                {onboardingText(onboardingContent.actions.signInEmail, locale)}
              </button>
              {actionError ? <p className="onboarding-error" role="alert">{actionError}</p> : null}
            </div>
          </section>
        ) : null}

        {step === "email" ? (
          <section className="onboarding-slide onboarding-auth-slide onboarding-email-auth-slide">
            <div className="onboarding-copy onboarding-auth-copy">
              <span>{onboardingText(onboardingContent.emailAuth.eyebrow, locale)}</span>
              <h1>{onboardingText(onboardingContent.emailAuth.title, locale)}</h1>
              <p>{onboardingText(onboardingContent.emailAuth.body, locale)}</p>
            </div>
            <div className="onboarding-auth-panel">
              <form className="onboarding-email-form" noValidate onSubmit={(event) => void handleEmailOtpRequest(event)}>
                <label htmlFor="onboarding-email">{onboardingText(onboardingContent.emailAuth.emailLabel, locale)}</label>
                <div className="onboarding-email-row">
                  <input
                    id="onboarding-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    disabled={emailOtpSentTo !== null}
                    placeholder={onboardingText(onboardingContent.emailAuth.emailPlaceholder, locale)}
                    aria-invalid={actionError === onboardingText(onboardingContent.errors.emailInvalid, locale)}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setActionError(null);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={activeAuthMethod !== null || emailOtpSentTo !== null}
                    aria-label={onboardingText(onboardingContent.actions.sendEmailCode, locale)}
                    title={onboardingText(onboardingContent.actions.sendEmailCode, locale)}
                  >
                    <Check size={22} />
                  </button>
                </div>
              </form>

              {emailOtpSentTo ? (
                <p className="onboarding-auth-status" role="status">
                  <span>{onboardingText(onboardingContent.emailAuth.otpSent, locale)}</span>
                  <strong>{emailOtpSentTo}</strong>
                </p>
              ) : null}

              <form className="onboarding-otp-form" noValidate onSubmit={(event) => void handleEmailOtpVerify(event)}>
                <label htmlFor="onboarding-email-otp">{onboardingText(onboardingContent.emailAuth.otpLabel, locale)}</label>
                <input
                  id="onboarding-email-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={emailOtp}
                  disabled={emailOtpSentTo === null}
                  placeholder={onboardingText(onboardingContent.emailAuth.otpPlaceholder, locale)}
                  aria-invalid={actionError === onboardingText(onboardingContent.errors.emailOtpInvalid, locale) || actionError === onboardingText(onboardingContent.errors.emailOtpVerify, locale)}
                  onChange={(event) => {
                    setEmailOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setActionError(null);
                  }}
                />
                <button className="onboarding-primary-action" type="submit" disabled={activeAuthMethod !== null || emailOtpSentTo === null}>
                  {onboardingText(onboardingContent.actions.verifyEmailCode, locale)}
                </button>
              </form>

              {emailOtpSentTo ? (
                <div className="onboarding-auth-secondary-actions">
                  <button
                    type="button"
                    disabled={activeAuthMethod !== null || resendSeconds > 0}
                    onClick={() => void sendEmailOtp(emailOtpSentTo, true)}
                  >
                    {resendSeconds > 0
                      ? onboardingText(onboardingContent.emailAuth.resendIn, locale).replace("{seconds}", String(resendSeconds))
                      : onboardingText(onboardingContent.actions.resendEmailCode, locale)}
                  </button>
                  <button type="button" disabled={activeAuthMethod !== null} onClick={changeEmail}>
                    {onboardingText(onboardingContent.actions.changeEmail, locale)}
                  </button>
                </div>
              ) : null}
              {actionError ? <p className="onboarding-error" role="alert">{actionError}</p> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

function readPendingEmailOtp(): { email: string; sentAt: number } | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PENDING_EMAIL_OTP_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { email?: unknown; sentAt?: unknown };
    if (typeof value.email !== "string" || typeof value.sentAt !== "number" || Date.now() - value.sentAt > PENDING_EMAIL_OTP_TTL_MS) {
      clearPendingEmailOtp();
      return null;
    }
    return { email: value.email, sentAt: value.sentAt };
  } catch {
    clearPendingEmailOtp();
    return null;
  }
}

function storePendingEmailOtp(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_EMAIL_OTP_STORAGE_KEY, JSON.stringify({ email, sentAt: Date.now() }));
  } catch {
    // The active in-memory OTP flow still works when browser storage is unavailable.
  }
}

function clearPendingEmailOtp() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_EMAIL_OTP_STORAGE_KEY);
  } catch {
    // Nothing else to clear when browser storage is unavailable.
  }
}

function OnboardingArtwork({ alt, priority = false, src }: { alt: string; priority?: boolean; src: string }) {
  return (
    <div className="onboarding-artwork">
      <Image alt={alt} fill priority={priority} sizes="(max-width: 600px) 100vw, 532px" src={src} />
      <span className="onboarding-artwork-glow" aria-hidden="true" />
    </div>
  );
}

function FirstRewardModal({
  reward,
  t,
  onClose
}: {
  reward: RegistrationReward;
  t: ReturnType<typeof useUserContext>["t"];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small challenge-complete-modal" role="dialog" aria-modal="true" aria-labelledby="first-reward-title">
        <span className="streak-complete-icon"><CheckCircle2 size={30} aria-hidden="true" /></span>
        <h2 id="first-reward-title">{t("onboarding.reward.title")}</h2>
        <p>{t("onboarding.reward.description")}</p>
        <div className="challenge-receipt">
          <div className="challenge-receipt-row emphasis">
            <span>{t("onboarding.reward.added")}</span>
            <strong>+{formatReward(reward.amount)}$</strong>
          </div>
          {typeof reward.balanceAfter === "number" ? (
            <div className="challenge-receipt-row">
              <span>{t("onboarding.reward.balance")}</span>
              <strong>{formatReward(reward.balanceAfter)}$</strong>
            </div>
          ) : null}
        </div>
        <button className="challenge-primary-action" type="button" onClick={onClose}>{t("onboarding.reward.openFeed")}</button>
      </div>
    </div>
  );
}

function readOnboardingSeen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
}

function isAuthScreenRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("auth") === "signin";
}

function markOnboardingSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
}

function readOnboardingDraft(): OnboardingDraft | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (typeof parsed !== "object" || !parsed) return undefined;
    return {
      dailyCoreTarget: typeof parsed.dailyCoreTarget === "number" ? parsed.dailyCoreTarget : 1,
      effort: parsed.effort === "light" || parsed.effort === "focused" ? parsed.effort : "steady",
      estimatedDays: typeof parsed.estimatedDays === "number" ? parsed.estimatedDays : null,
      mainWish: typeof parsed.mainWish === "string" ? parsed.mainWish : "",
      targetCore: typeof parsed.targetCore === "number" ? parsed.targetCore : 1000
    };
  } catch {
    return undefined;
  }
}

async function saveProfileCompletion(
  profile: UserProfile,
  applyServerData: ReturnType<typeof useUserContext>["applyServerData"],
  draft?: OnboardingDraft
) {
  const onboardingState = readOnboardingState(profile.onboarding_state);
  const nextProfile = {
    ...profile,
    onboarding_state: {
      ...onboardingState,
      firstExperienceCompleted: true,
      ...(draft ? { firstPlanDraft: draft } : {})
    },
    updated_at: new Date().toISOString()
  };

  applyServerData({ profile: nextProfile });

  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({
      onboarding_state: nextProfile.onboarding_state,
      updated_at: nextProfile.updated_at
    })
    .eq("user_id", profile.user_id);

  if (error) throw error;
}

function hasCompletedFirstExperience(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return readOnboardingState(profile.onboarding_state).firstExperienceCompleted === true;
}

function readOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as OnboardingState;
}

function openFeedAfterAuth() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "people");
  url.searchParams.delete("auth");
  window.history.replaceState({ view: "people" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatReward(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}
