"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle2, LogIn, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import {
  consumePostAuthReward,
  getBrowserSupabaseClient,
  signInWithGoogle,
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

type StepId = "mission" | "stories" | "program";
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

const steps: StepId[] = ["mission", "stories", "program"];

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
    if (!user || !profile || !onboardingSeen || profileCompleted) return;
    const draft = readOnboardingDraft();
    void saveProfileCompletion(profile, applyServerData, draft);
  }, [applyServerData, onboardingSeen, profile, profileCompleted, user]);

  if (!authResolved || onboardingSeen === null) return null;

  if (!user) {
    if (onboardingLocale === null) return null;
    return (
      <OnboardingApp
        initialStep={onboardingSeen ? "program" : "mission"}
        locale={onboardingLocale ?? "en"}
        onLocaleChange={async (nextLocale) => {
          storeOnboardingLocalePreference(nextLocale);
          setOnboardingLocale(nextLocale);
        }}
        onSignIn={async () => {
          markOnboardingSeen();
          setOnboardingSeen(true);
          trackProductEvent("onboarding_auth_started", { retry: false, version: "abundance_mission_v3" });
          await signInWithGoogle();
        }}
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
  onSignIn
}: {
  initialStep: StepId;
  locale: OnboardingLocale;
  onLocaleChange: (locale: OnboardingLocale) => Promise<void>;
  onSignIn: () => Promise<void>;
}) {
  const [step, setStep] = useState<StepId>(initialStep);
  const [signingIn, setSigningIn] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentIndex = steps.indexOf(step);

  useEffect(() => {
    trackProductEvent("onboarding_viewed", { locale, version: "abundance_mission_v3" });
  }, [locale]);

  function goTo(nextStep: StepId) {
    setActionError(null);
    setStep(nextStep);
    trackProductEvent("onboarding_step_viewed", { step: nextStep, version: "abundance_mission_v3" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSignIn() {
    setSigningIn(true);
    setActionError(null);

    try {
      await onSignIn();
    } catch {
      setActionError(onboardingText(onboardingContent.errors.auth, locale));
      setSigningIn(false);
    }
  }

  const previousStep = currentIndex > 0 ? steps[currentIndex - 1] : null;

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
            {actionError ? <p className="onboarding-error">{actionError}</p> : null}
            <div className="onboarding-final-actions">
              <button className="onboarding-primary-action" type="button" disabled={signingIn} onClick={() => void handleSignIn()}>
                <LogIn size={18} />
                {onboardingText(onboardingContent.actions.signInGoogle, locale)}
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
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
