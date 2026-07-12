"use client";

import { ArrowLeft, ArrowRight, BarChart3, Check, Sparkles, UserRound } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import type { AppLocale } from "@/lib/i18n";
import { ONBOARDING_SEEN_STORAGE_KEY, onboardingContent, onboardingText } from "@/lib/onboardingContent";

type StepId = "intro" | "showcase" | "explain" | "questions" | "result";
type TimeOptionId = "short" | "medium" | "deep";
type OnboardingState = Record<string, unknown> & {
  firstExperienceCompleted?: boolean;
};

const steps: StepId[] = ["intro", "showcase", "explain", "questions", "result"];

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { applyServerData, loading, locale, profile, user } = useUserContext();
  const [guestSeen, setGuestSeen] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setGuestSeen(readGuestSeen());
  }, []);

  const profileCompleted = hasCompletedFirstExperience(profile);

  useEffect(() => {
    if (!user || !profile || !guestSeen || profileCompleted) return;
    void saveProfileCompletion(profile, applyServerData);
  }, [applyServerData, guestSeen, profile, profileCompleted, user]);

  if (loading || guestSeen === null) return null;

  const shouldShowGuestOnboarding = !user && !guestSeen;
  const shouldShowUserOnboarding = Boolean(user && profile && !profileCompleted && !guestSeen);

  if (!dismissed && (shouldShowGuestOnboarding || shouldShowUserOnboarding)) {
    return (
      <OnboardingApp
        locale={locale}
        onBrowseMore={async () => {
          await completeOnboarding(profile, applyServerData);
          openPeopleFeed();
          setGuestSeen(true);
          setDismissed(true);
        }}
        onCreateAccount={async () => {
          markGuestSeen();
          setGuestSeen(true);
          await signInWithGoogle();
        }}
      />
    );
  }

  return <>{children}</>;
}

function OnboardingApp({
  locale,
  onBrowseMore,
  onCreateAccount
}: {
  locale: AppLocale;
  onBrowseMore: () => Promise<void>;
  onCreateAccount: () => Promise<void>;
}) {
  const [step, setStep] = useState<StepId>("intro");
  const [timeOption, setTimeOption] = useState<TimeOptionId>("medium");
  const [goal, setGoal] = useState("");
  const [referrals, setReferrals] = useState("3");
  const [savingAction, setSavingAction] = useState<"browse" | "account" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentIndex = steps.indexOf(step);
  const potential = useMemo(() => calculatePotential(timeOption, referrals), [referrals, timeOption]);

  function goTo(nextStep: StepId) {
    setActionError(null);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleBrowseMore() {
    setSavingAction("browse");
    setActionError(null);
    try {
      await onBrowseMore();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save onboarding state.");
      setSavingAction(null);
    }
  }

  async function handleCreateAccount() {
    setSavingAction("account");
    setActionError(null);
    try {
      await onCreateAccount();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start sign-in.");
      setSavingAction(null);
    }
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-shell" aria-live="polite">
        <header className="onboarding-top">
          <span>{onboardingContent.intro.badge[locale]}</span>
          <div className="onboarding-progress" aria-hidden="true">
            {steps.map((item) => (
              <i className={steps.indexOf(item) <= currentIndex ? "active" : ""} key={item} />
            ))}
          </div>
        </header>

        {step === "intro" ? (
          <section className="onboarding-hero">
            <span className="onboarding-hero-icon" aria-hidden="true">
              <Sparkles size={34} />
            </span>
            <h1>{onboardingText(onboardingContent.intro.title, locale)}</h1>
            <p>{onboardingText(onboardingContent.intro.body, locale)}</p>
            <div className="onboarding-actions">
              <button className="challenge-primary-action" type="button" onClick={() => goTo("showcase")}>
                {onboardingText(onboardingContent.actions.viewFeed, locale)}
                <ArrowRight size={17} />
              </button>
              <button className="challenge-secondary-action" type="button" onClick={() => goTo("showcase")}>
                {onboardingText(onboardingContent.actions.viewExamples, locale)}
              </button>
            </div>
          </section>
        ) : null}

        {step === "showcase" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{locale === "ru" ? "Витрина" : "Showcase"}</span>
              <h2>{locale === "ru" ? "Сначала смотри на результаты" : "Start with visible results"}</h2>
            </div>
            <div className="onboarding-showcase-list">
              {onboardingContent.showcaseCards.map((card) => (
                <article className="onboarding-showcase-card" key={onboardingText(card.name, locale)}>
                  <span className="onboarding-avatar" aria-hidden="true">
                    <UserRound size={20} />
                  </span>
                  <div>
                    <h3>{onboardingText(card.name, locale)}, {locale === "ru" ? "уровень" : "level"} {card.level}</h3>
                    {card.stats[locale].map((stat) => <p key={stat}>{stat}</p>)}
                    {card.quote ? <blockquote>{onboardingText(card.quote, locale)}</blockquote> : null}
                  </div>
                </article>
              ))}
            </div>
            <StepActions locale={locale} onBack={() => goTo("intro")} onNext={() => goTo("explain")} />
          </section>
        ) : null}

        {step === "explain" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{locale === "ru" ? "Коротко" : "Short version"}</span>
              <h2>{locale === "ru" ? "Что это вообще такое?" : "What is this?"}</h2>
            </div>
            <div className="onboarding-point-grid">
              {onboardingContent.explanationPoints.map((point) => (
                <article className="onboarding-point" key={onboardingText(point.title, locale)}>
                  <Check size={18} />
                  <div>
                    <strong>{onboardingText(point.title, locale)}</strong>
                    <p>{onboardingText(point.body, locale)}</p>
                  </div>
                </article>
              ))}
            </div>
            <StepActions locale={locale} onBack={() => goTo("showcase")} onNext={() => goTo("questions")} />
          </section>
        ) : null}

        {step === "questions" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{locale === "ru" ? "Без регистрации" : "No sign-up yet"}</span>
              <h2>{locale === "ru" ? "Прикинем твой потенциал" : "Estimate your potential"}</h2>
            </div>
            <div className="onboarding-form">
              <fieldset>
                <legend>{onboardingText(onboardingContent.questions.time.title, locale)}</legend>
                <div className="onboarding-choice-row">
                  {onboardingContent.questions.time.options.map((option) => (
                    <label className={timeOption === option.id ? "active" : ""} key={option.id}>
                      <input
                        checked={timeOption === option.id}
                        name="onboarding-time"
                        type="radio"
                        value={option.id}
                        onChange={() => setTimeOption(option.id)}
                      />
                      {onboardingText(option.label, locale)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                <span>{onboardingText(onboardingContent.questions.goal.title, locale)}</span>
                <input value={goal} placeholder={onboardingText(onboardingContent.questions.goal.placeholder, locale)} onChange={(event) => setGoal(event.target.value)} />
              </label>
              <label>
                <span>{onboardingText(onboardingContent.questions.referrals.title, locale)}</span>
                <input inputMode="numeric" value={referrals} placeholder={onboardingText(onboardingContent.questions.referrals.placeholder, locale)} onChange={(event) => setReferrals(event.target.value)} />
              </label>
            </div>
            <div className="onboarding-step-actions">
              <button className="challenge-secondary-action" type="button" onClick={() => goTo("explain")}>
                <ArrowLeft size={16} />
                {onboardingText(onboardingContent.actions.back, locale)}
              </button>
              <button className="challenge-primary-action" type="button" onClick={() => goTo("result")}>
                {onboardingText(onboardingContent.actions.estimate, locale)}
              </button>
            </div>
          </section>
        ) : null}

        {step === "result" ? (
          <section className="onboarding-step onboarding-result-step">
            <span className="onboarding-result-icon" aria-hidden="true">
              <BarChart3 size={34} />
            </span>
            <div className="onboarding-section-title centered">
              <span>{locale === "ru" ? "Сценарий" : "Scenario"}</span>
              <h2>
                {locale === "ru" ? "Твой потенциал" : "Your potential"}: ${potential.low}-{potential.high} Core
              </h2>
            </div>
            <p className="onboarding-result-copy">
              {onboardingText(onboardingContent.potentialRules.levelHint, locale)}
              {goal.trim() ? ` ${locale === "ru" ? "Цель" : "Goal"}: ${goal.trim()}.` : ""}
            </p>
            <p className="onboarding-disclaimer">{onboardingText(onboardingContent.potentialRules.disclaimer, locale)}</p>
            {actionError ? <p className="challenge-error">{actionError}</p> : null}
            <div className="onboarding-final-actions">
              <button className="challenge-primary-action" type="button" disabled={savingAction !== null} onClick={handleCreateAccount}>
                {savingAction === "account" ? (locale === "ru" ? "Открываем Google..." : "Opening Google...") : onboardingText(onboardingContent.actions.createAccount, locale)}
              </button>
              <button className="challenge-secondary-action" type="button" disabled={savingAction !== null} onClick={handleBrowseMore}>
                {savingAction === "browse" ? (locale === "ru" ? "Открываем..." : "Opening...") : onboardingText(onboardingContent.actions.browseMore, locale)}
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function StepActions({ locale, onBack, onNext }: { locale: AppLocale; onBack: () => void; onNext: () => void }) {
  return (
    <div className="onboarding-step-actions">
      <button className="challenge-secondary-action" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        {onboardingText(onboardingContent.actions.back, locale)}
      </button>
      <button className="challenge-primary-action" type="button" onClick={onNext}>
        {onboardingText(onboardingContent.actions.continue, locale)}
        <ArrowRight size={17} />
      </button>
    </div>
  );
}

function calculatePotential(timeOption: TimeOptionId, referralsInput: string): { low: number; high: number } {
  const option = onboardingContent.questions.time.options.find((item) => item.id === timeOption) ?? onboardingContent.questions.time.options[1];
  const referrals = Math.max(0, Math.min(50, Math.floor(Number(referralsInput.replace(",", ".")) || 0)));
  const [referralLow, referralHigh] = onboardingContent.potentialRules.referralCoreRange;

  return {
    low: option.range[0] + referrals * referralLow,
    high: option.range[1] + referrals * referralHigh
  };
}

function readGuestSeen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
}

function markGuestSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
}

async function completeOnboarding(profile: UserProfile | null, applyServerData: ReturnType<typeof useUserContext>["applyServerData"]) {
  markGuestSeen();
  if (!profile) return;
  await saveProfileCompletion(profile, applyServerData);
}

async function saveProfileCompletion(profile: UserProfile, applyServerData: ReturnType<typeof useUserContext>["applyServerData"]) {
  const onboardingState = readOnboardingState(profile.onboarding_state);
  const nextProfile = {
    ...profile,
    onboarding_state: {
      ...onboardingState,
      firstExperienceCompleted: true
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

function openPeopleFeed() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "people");
  window.history.replaceState({ view: "people" }, "", `${url.pathname}${url.search}${url.hash}`);
}
