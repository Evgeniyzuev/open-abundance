"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Calculator, ListChecks, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { AppLocale } from "@/lib/i18n";
import { ONBOARDING_DRAFT_STORAGE_KEY, ONBOARDING_SEEN_STORAGE_KEY, onboardingContent, onboardingText } from "@/lib/onboardingContent";
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
  const { applyServerData, authResolved, locale, profile, user } = useUserContext();
  const [guestSeen, setGuestSeen] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setGuestSeen(readGuestSeen());
  }, []);

  const profileCompleted = hasCompletedFirstExperience(profile);

  useEffect(() => {
    if (!profileCompleted || guestSeen !== false) return;
    markGuestSeen();
    setGuestSeen(true);
  }, [guestSeen, profileCompleted]);

  useEffect(() => {
    if (!user || !profile || !guestSeen || profileCompleted) return;
    const draft = readOnboardingDraft();
    void saveProfileCompletion(profile, applyServerData, draft);
  }, [applyServerData, guestSeen, profile, profileCompleted, user]);

  if (guestSeen === null) return null;

  // A returning device can open local-first views without waiting for auth or API refreshes.
  if (guestSeen) return <>{children}</>;

  // For a new device, only the locally persisted auth session is needed to choose
  // between onboarding and the app shell. Profile/context loading remains background work.
  if (!authResolved) return null;

  const shouldShowGuestOnboarding = !user && !guestSeen;
  const shouldShowUserOnboarding = Boolean(user && profile && !profileCompleted && !guestSeen);

  if (!dismissed && (shouldShowGuestOnboarding || shouldShowUserOnboarding)) {
    return (
      <OnboardingApp
        locale={locale}
        onCalculatePath={async () => {
          await completeOnboarding(profile, applyServerData);
          openCalculatorPath();
          setGuestSeen(true);
          setDismissed(true);
        }}
        onOpenFirstTask={async () => {
          await completeOnboarding(profile, applyServerData);
          openFirstPath();
          setGuestSeen(true);
          setDismissed(true);
        }}
      />
    );
  }

  return <>{children}</>;
}

function OnboardingApp({
  locale,
  onCalculatePath,
  onOpenFirstTask
}: {
  locale: AppLocale;
  onCalculatePath: () => Promise<void>;
  onOpenFirstTask: () => Promise<void>;
}) {
  const [step, setStep] = useState<StepId>("mission");
  const [savingAction, setSavingAction] = useState<"calculate" | "task" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentIndex = steps.indexOf(step);

  useEffect(() => {
    trackProductEvent("onboarding_viewed", { locale, version: "abundance_mission_v2" });
  }, [locale]);

  function goTo(nextStep: StepId) {
    setActionError(null);
    setStep(nextStep);
    trackProductEvent("onboarding_step_viewed", { step: nextStep, version: "abundance_mission_v2" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleComplete(action: "calculate" | "task") {
    setSavingAction(action);
    setActionError(null);

    try {
      trackProductEvent("onboarding_completed", {
        path: action === "calculate" ? "growth_calculator" : "first_task",
        version: "abundance_mission_v2"
      });
      await (action === "calculate" ? onCalculatePath() : onOpenFirstTask());
    } catch {
      setActionError(onboardingText(onboardingContent.errors.complete, locale));
      setSavingAction(null);
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
              <button className="onboarding-primary-action" type="button" disabled={savingAction !== null} onClick={() => void handleComplete("calculate")}>
                <Calculator size={18} />
                {onboardingText(onboardingContent.actions.calculatePath, locale)}
              </button>
              <button className="onboarding-secondary-action" type="button" disabled={savingAction !== null} onClick={() => void handleComplete("task")}>
                <ListChecks size={18} />
                {onboardingText(onboardingContent.actions.startFirstTask, locale)}
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

function readGuestSeen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "true";
}

function markGuestSeen() {
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

async function completeOnboarding(
  profile: UserProfile | null,
  applyServerData: ReturnType<typeof useUserContext>["applyServerData"],
  draft?: OnboardingDraft
) {
  markGuestSeen();
  if (!profile) return;
  await saveProfileCompletion(profile, applyServerData, draft);
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

function openCalculatorPath() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "wallet.core");
  url.searchParams.set("calculator", "target");
  window.history.replaceState({ view: "wallet.core" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function openFirstPath() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "challenges");
  url.searchParams.delete("calculator");
  window.history.replaceState({ view: "challenges" }, "", `${url.pathname}${url.search}${url.hash}`);
}
