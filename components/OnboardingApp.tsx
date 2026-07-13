"use client";

import { ArrowLeft, ArrowRight, BarChart3, Check, Sparkles, Target } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import { getBrowserSupabaseClient, signInWithGoogle } from "@/lib/supabaseClient";
import type { AppLocale } from "@/lib/i18n";
import { ONBOARDING_DRAFT_STORAGE_KEY, ONBOARDING_SEEN_STORAGE_KEY, onboardingContent, onboardingText, type EffortOptionId } from "@/lib/onboardingContent";
import { trackProductEvent } from "@/lib/productAnalytics";

type StepId = "intro" | "story" | "wish" | "plan" | "result";
type OnboardingState = Record<string, unknown> & {
  firstExperienceCompleted?: boolean;
  firstPlanDraft?: OnboardingDraft;
};
type OnboardingDraft = {
  dailyCoreTarget: number;
  effort: EffortOptionId;
  estimatedDays: number | null;
  mainWish: string;
  targetCore: number;
};

const steps: StepId[] = ["intro", "story", "wish", "plan", "result"];

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
    const draft = readOnboardingDraft();
    void saveProfileCompletion(profile, applyServerData, draft);
  }, [applyServerData, guestSeen, profile, profileCompleted, user]);

  if (loading || guestSeen === null) return null;

  const shouldShowGuestOnboarding = !user && !guestSeen;
  const shouldShowUserOnboarding = Boolean(user && profile && !profileCompleted && !guestSeen);

  if (!dismissed && (shouldShowGuestOnboarding || shouldShowUserOnboarding)) {
    return (
      <OnboardingApp
        locale={locale}
        onOpenFirstPath={async (draft) => {
          saveOnboardingDraft(draft);
          await completeOnboarding(profile, applyServerData, draft);
          openFirstPath();
          setGuestSeen(true);
          setDismissed(true);
        }}
        onCreateAccount={async (draft) => {
          saveOnboardingDraft(draft);
          markGuestSeen();
          setGuestSeen(true);
          trackProductEvent("auth_started", { source: "onboarding" });
          await signInWithGoogle();
        }}
      />
    );
  }

  return <>{children}</>;
}

function OnboardingApp({
  locale,
  onOpenFirstPath,
  onCreateAccount
}: {
  locale: AppLocale;
  onOpenFirstPath: (draft: OnboardingDraft) => Promise<void>;
  onCreateAccount: (draft: OnboardingDraft) => Promise<void>;
}) {
  const [step, setStep] = useState<StepId>("intro");
  const [mainWish, setMainWish] = useState("");
  const [targetCore, setTargetCore] = useState("1000");
  const [dailyCoreTarget, setDailyCoreTarget] = useState("1");
  const [effort, setEffort] = useState<EffortOptionId>("steady");
  const [savingAction, setSavingAction] = useState<"open" | "account" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentIndex = steps.indexOf(step);
  const draft = useMemo(
    () => buildDraft({ dailyCoreTarget, effort, mainWish, targetCore }),
    [dailyCoreTarget, effort, mainWish, targetCore]
  );

  useEffect(() => {
    trackProductEvent("onboarding_viewed", { locale, version: "first_plan" });
  }, [locale]);

  function goTo(nextStep: StepId) {
    setActionError(null);
    setStep(nextStep);
    trackProductEvent("onboarding_step_viewed", { step: nextStep, version: "first_plan" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleOpenFirstPath() {
    setSavingAction("open");
    setActionError(null);
    try {
      trackProductEvent("onboarding_completed", { path: "first_core_path", version: "first_plan" });
      await onOpenFirstPath(draft);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save onboarding state.");
      setSavingAction(null);
    }
  }

  async function handleCreateAccount() {
    setSavingAction("account");
    setActionError(null);
    try {
      await onCreateAccount(draft);
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
              <button className="challenge-primary-action" type="button" onClick={() => goTo("story")}>
                {onboardingText(onboardingContent.actions.startPlan, locale)}
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
        ) : null}

        {step === "story" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{onboardingText(onboardingContent.story.eyebrow, locale)}</span>
              <h2>{onboardingText(onboardingContent.story.title, locale)}</h2>
            </div>
            <div className="onboarding-point-grid">
              {onboardingContent.story.points.map((point) => (
                <article className="onboarding-point" key={onboardingText(point.title, locale)}>
                  <Check size={18} />
                  <div>
                    <strong>{onboardingText(point.title, locale)}</strong>
                    <p>{onboardingText(point.body, locale)}</p>
                  </div>
                </article>
              ))}
            </div>
            <StepActions locale={locale} onBack={() => goTo("intro")} onNext={() => goTo("wish")} />
          </section>
        ) : null}

        {step === "wish" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{onboardingText(onboardingContent.wish.eyebrow, locale)}</span>
              <h2>{onboardingText(onboardingContent.wish.title, locale)}</h2>
            </div>
            <p className="onboarding-result-copy">{onboardingText(onboardingContent.wish.body, locale)}</p>
            <div className="onboarding-form">
              <label>
                <span>{onboardingText(onboardingContent.wish.eyebrow, locale)}</span>
                <input value={mainWish} placeholder={onboardingText(onboardingContent.wish.placeholder, locale)} onChange={(event) => setMainWish(event.target.value)} />
              </label>
            </div>
            <StepActions locale={locale} onBack={() => goTo("story")} onNext={() => goTo("plan")} />
          </section>
        ) : null}

        {step === "plan" ? (
          <section className="onboarding-step">
            <div className="onboarding-section-title">
              <span>{onboardingText(onboardingContent.plan.eyebrow, locale)}</span>
              <h2>{onboardingText(onboardingContent.plan.title, locale)}</h2>
            </div>
            <div className="onboarding-form">
              <label>
                <span>{onboardingText(onboardingContent.plan.targetLabel, locale)}</span>
                <input inputMode="decimal" value={targetCore} placeholder={onboardingText(onboardingContent.plan.targetPlaceholder, locale)} onChange={(event) => setTargetCore(event.target.value)} />
              </label>
              <label>
                <span>{onboardingText(onboardingContent.plan.dailyLabel, locale)}</span>
                <input inputMode="decimal" value={dailyCoreTarget} placeholder={onboardingText(onboardingContent.plan.dailyPlaceholder, locale)} onChange={(event) => setDailyCoreTarget(event.target.value)} />
              </label>
              <fieldset>
                <legend>{onboardingText(onboardingContent.plan.effortLabel, locale)}</legend>
                <div className="onboarding-choice-row">
                  {onboardingContent.plan.effortOptions.map((option) => (
                    <label className={effort === option.id ? "active" : ""} key={option.id}>
                      <input
                        checked={effort === option.id}
                        name="onboarding-effort"
                        type="radio"
                        value={option.id}
                        onChange={() => setEffort(option.id)}
                      />
                      {onboardingText(option.label, locale)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="onboarding-step-actions">
              <button className="challenge-secondary-action" type="button" onClick={() => goTo("wish")}>
                <ArrowLeft size={16} />
                {onboardingText(onboardingContent.actions.back, locale)}
              </button>
              <button className="challenge-primary-action" type="button" onClick={() => goTo("result")}>
                {onboardingText(onboardingContent.actions.continue, locale)}
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
              <span>{onboardingText(onboardingContent.result.eyebrow, locale)}</span>
              <h2>{onboardingText(onboardingContent.result.title, locale)}</h2>
            </div>
            <PlanSummary draft={draft} locale={locale} />
            <p className="onboarding-result-copy">{onboardingText(onboardingContent.result.body, locale)}</p>
            <p className="onboarding-disclaimer">{onboardingText(onboardingContent.result.disclaimer, locale)}</p>
            {actionError ? <p className="challenge-error">{actionError}</p> : null}
            <div className="onboarding-final-actions">
              <button className="challenge-primary-action" type="button" disabled={savingAction !== null} onClick={handleOpenFirstPath}>
                {savingAction === "open" ? loadingText(locale) : (
                  <>
                    <Target size={17} />
                    {onboardingText(onboardingContent.actions.openFirstStep, locale)}
                  </>
                )}
              </button>
              <button className="challenge-secondary-action" type="button" disabled={savingAction !== null} onClick={handleCreateAccount}>
                {savingAction === "account" ? loadingText(locale) : onboardingText(onboardingContent.actions.createAccount, locale)}
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

function PlanSummary({ draft, locale }: { draft: OnboardingDraft; locale: AppLocale }) {
  const target = formatMoney(draft.targetCore, locale);
  const daily = formatMoney(draft.dailyCoreTarget, locale);
  const estimate = draft.estimatedDays
    ? locale === "ru"
      ? `примерно ${formatDays(draft.estimatedDays, locale)}`
      : `about ${formatDays(draft.estimatedDays, locale)}`
    : locale === "ru"
      ? "после первого расчета"
      : "after the first calculation";

  return (
    <div className="onboarding-point-grid">
      <article className="onboarding-point">
        <Target size={18} />
        <div>
          <strong>{draft.mainWish || (locale === "ru" ? "Главное желание" : "Main wish")}</strong>
          <p>{target} Core target · {daily}/day · {estimate}</p>
        </div>
      </article>
    </div>
  );
}

function buildDraft(input: { dailyCoreTarget: string; effort: EffortOptionId; mainWish: string; targetCore: string }): OnboardingDraft {
  const targetCore = cleanMoney(input.targetCore, 1000);
  const dailyCoreTarget = cleanMoney(input.dailyCoreTarget, 1);
  const effort = onboardingContent.plan.effortOptions.find((option) => option.id === input.effort) ?? onboardingContent.plan.effortOptions[1];
  const dailyPace = dailyCoreTarget * effort.multiplier;

  return {
    dailyCoreTarget,
    effort: effort.id,
    estimatedDays: dailyPace > 0 ? Math.ceil(targetCore / dailyPace) : null,
    mainWish: input.mainWish.trim(),
    targetCore
  };
}

function cleanMoney(value: string, fallback: number): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(100_000_000, parsed);
}

function formatMoney(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    maximumFractionDigits: value < 10 && value % 1 !== 0 ? 2 : 0
  }).format(value);
}

function formatDays(days: number, locale: AppLocale): string {
  if (days >= 365) {
    const years = Math.max(1, Math.round(days / 365));
    return locale === "ru" ? `${years} г.` : `${years}y`;
  }
  if (days >= 30) {
    const months = Math.max(1, Math.round(days / 30));
    return locale === "ru" ? `${months} мес.` : `${months}mo`;
  }
  return locale === "ru" ? `${days} дн.` : `${days}d`;
}

function readGuestSeen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
}

function markGuestSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
}

function saveOnboardingDraft(draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
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

async function completeOnboarding(profile: UserProfile | null, applyServerData: ReturnType<typeof useUserContext>["applyServerData"], draft: OnboardingDraft) {
  markGuestSeen();
  if (!profile) return;
  await saveProfileCompletion(profile, applyServerData, draft);
}

async function saveProfileCompletion(profile: UserProfile, applyServerData: ReturnType<typeof useUserContext>["applyServerData"], draft?: OnboardingDraft) {
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

function openFirstPath() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "challenges");
  window.history.replaceState({ view: "challenges" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function loadingText(locale: AppLocale): string {
  return locale === "ru" ? "Открываем..." : "Opening...";
}
