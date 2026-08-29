"use client";

import { Check, Download, House, MoreVertical, Share2, Smartphone, Star } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CoreAccount } from "@/components/UserProvider";
import {
  APP_TESTING_ATTITUDES,
  APP_TESTING_CONCERNS,
  APP_TESTING_INSTALL_OUTCOMES,
  APP_TESTING_OUTCOMES,
  APP_TESTING_SECTIONS,
  APP_TESTING_STRENGTHS,
  APP_TESTING_USEFUL_AREAS,
  APP_TESTING_USE_INTENTS,
  createEmptyAppTestingDraft,
  detectAppTestingPlatform,
  getAppTestingContext,
  normalizeAppTestingDraft,
  validateAppTestingSubmission,
  type AppTestingDraft,
  type AppTestingSectionId
} from "@/lib/appTestingFeedback";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { canPromptPwaInstall, promptPwaInstall, subscribeToPwaInstallPrompt } from "@/lib/pwaInstall";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { formatRoundedMoney } from "@/lib/moneyFormat";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;
export type AppTestingNavigationTarget = "home.home" | "goals.notes" | "spark" | "wallet.core" | "people.feed";

type CompletionReward = {
  amount: number;
  account: "core" | "wallet";
  claimed: boolean;
  coreBalanceAfter: number | null;
};

export default function AppTestingSurvey({
  author,
  locale,
  t,
  onApplyServerData,
  onComplete,
  onNavigate,
  onRefresh
}: {
  author: { avatarUrl: string | null; displayName: string; level: number };
  locale: AppLocale;
  t: TFunction;
  onApplyServerData: (data: { core?: CoreAccount | null }) => void;
  onComplete: (reward: CompletionReward) => void;
  onNavigate: (target: AppTestingNavigationTarget) => void;
  onRefresh: () => Promise<void>;
}) {
  const rewardLabel = formatRoundedMoney(3, locale);
  const [draft, setDraft] = useState<AppTestingDraft>(() => createEmptyAppTestingDraft());
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "submitting" | "submitted">("loading");
  const [error, setError] = useState<string | null>(null);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const hydratedRef = useRef(false);
  const saveVersionRef = useRef(0);
  const backupKeyRef = useRef<string | null>(null);
  const statusRef = useRef(status);

  const loadDraft = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("challenges.signInFirst"));
      const backupKey = `open-abundance:app-testing:${session.user.id}:v1`;
      backupKeyRef.current = backupKey;
      const localDraft = readLocalDraft(backupKey);
      const response = await fetch(`/api/challenges/app-testing?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}`, "Cache-Control": "no-cache" }
      });
      const payload = (await response.json()) as { draft?: unknown; challengeStatus?: string | null; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("appTesting.loadFailed"));
      const nextDraft = normalizeAppTestingDraft(payload.draft ?? localDraft, detectAppTestingPlatform());
      nextDraft.context = { ...getAppTestingContext(), ...nextDraft.context };
      nextDraft.publicConsent = false;
      setDraft(nextDraft);
      setStatus(nextDraft.status === "submitted" || payload.challengeStatus === "completed" ? "submitted" : "ready");
      hydratedRef.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("appTesting.loadFailed"));
      setStatus("ready");
      hydratedRef.current = true;
    }
  }, [t]);

  const saveDraft = useCallback(async (nextDraft: AppTestingDraft, version: number) => {
    setStatus((current) => current === "submitting" || current === "submitted" ? current : "saving");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/challenges/app-testing", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...nextDraft, publicConsent: false })
      });
      const payload = (await response.json()) as { error?: string; submitted?: boolean };
      if (!response.ok || payload.error) throw new Error(payload.error ?? t("appTesting.saveFailed"));
      if (version !== saveVersionRef.current) return;
      setStatus(payload.submitted ? "submitted" : "ready");
    } catch {
      if (version === saveVersionRef.current) setStatus("ready");
    }
  }, [t]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    const updateAvailability = () => setInstallPromptAvailable(canPromptPwaInstall());
    updateAvailability();
    return subscribeToPwaInstallPrompt(updateAvailability);
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!hydratedRef.current || statusRef.current === "submitted" || statusRef.current === "submitting") return;
    if (backupKeyRef.current) localStorage.setItem(backupKeyRef.current, JSON.stringify({ ...draft, publicConsent: false }));
    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    const timer = window.setTimeout(() => {
      void saveDraft(draft, version);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [draft, saveDraft]);

  function updateSection(section: AppTestingSectionId, patch: Partial<AppTestingDraft["answers"][AppTestingSectionId]>) {
    setDraft((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [section]: { ...current.answers[section], ...patch }
      }
    }));
  }

  async function installAndroidApp() {
    const outcome = await promptPwaInstall();
    if (outcome === "accepted") {
      setDraft((current) => ({ ...current, installOutcome: "installed_now" }));
      updateSection("install", { outcome: "worked", rating: Math.max(draft.answers.install.rating, 4) });
    }
  }

  async function submitFeedback() {
    const validationError = validateAppTestingSubmission(draft);
    if (validationError) {
      setError(localizeValidationError(validationError, t));
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/challenges/app-testing", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...draft, context: { ...getAppTestingContext(), ...draft.context } })
      });
      const payload = (await response.json()) as {
        completed?: boolean;
        core?: CoreAccount | null;
        error?: string;
        rewardAmount?: number;
        rewardClaimed?: boolean;
      };
      if (!response.ok || payload.error || !payload.completed) throw new Error(payload.error ?? t("appTesting.submitFailed"));
      if (backupKeyRef.current) localStorage.removeItem(backupKeyRef.current);
      setStatus("submitted");
      onApplyServerData({ core: payload.core });
      onComplete({
        amount: payload.rewardAmount ?? 3,
        account: "core",
        claimed: Boolean(payload.rewardClaimed),
        coreBalanceAfter: payload.core?.balance ?? null
      });
      await onRefresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("appTesting.submitFailed"));
      setStatus("ready");
    }
  }

  if (status === "loading") return <p className="challenge-note">{t("app.common.loading")}</p>;
  if (status === "submitted") {
    return (
      <section className="app-testing-complete">
        <Check size={22} />
        <div>
          <strong>{t("appTesting.submittedTitle")}</strong>
          <p>{t("appTesting.submittedDescription")}</p>
        </div>
      </section>
    );
  }

  const isDesktop = draft.platform === "desktop" || draft.platform === "other";
  return (
    <section className="app-testing-survey">
      <header className="app-testing-intro">
        <span>{t("appTesting.progress", { completed: countCompletedSections(draft), total: APP_TESTING_SECTIONS.length })}</span>
        <small>{status === "saving" ? t("appTesting.saving") : t("appTesting.saved")}</small>
      </header>

      {APP_TESTING_SECTIONS.map((section, index) => (
        <section className="app-testing-section" key={section}>
          <div className="app-testing-section-heading">
            <span>{index + 1}</span>
            <div>
              <h4>{t(`appTesting.section.${section}.title` as MessageKey)}</h4>
              <p>{t(`appTesting.section.${section}.description` as MessageKey)}</p>
            </div>
          </div>

          {section === "install" ? (
            <InstallGuide
              installPromptAvailable={installPromptAvailable}
              isDesktop={isDesktop}
              locale={locale}
              platform={draft.platform}
              t={t}
              onInstall={() => { void installAndroidApp(); }}
              onPlatformChange={(platform) => setDraft((current) => ({ ...current, platform }))}
            />
          ) : (
            <button className="app-testing-open-area" type="button" onClick={() => onNavigate(sectionTarget(section))}>
              {t("appTesting.openArea")}
            </button>
          )}

          {section === "install" ? (
            <label className="app-testing-field">
              <span>{t("appTesting.installResult")}</span>
              <select
                value={draft.installOutcome}
                onChange={(event) => setDraft((current) => ({ ...current, installOutcome: event.target.value as AppTestingDraft["installOutcome"] }))}
              >
                <option value="">{t("appTesting.choose")}</option>
                {APP_TESTING_INSTALL_OUTCOMES.map((item) => (
                  <option value={item} key={item}>{t(`appTesting.install.${item}` as MessageKey)}</option>
                ))}
              </select>
            </label>
          ) : null}

          <OutcomeEditor
            answer={draft.answers[section]}
            section={section}
            t={t}
            onChange={(patch) => updateSection(section, patch)}
          />
        </section>
      ))}

      <section className="app-testing-section">
        <div className="app-testing-section-heading">
          <span>7</span>
          <div>
            <h4>{t("appTesting.general.title")}</h4>
            <p>{t("appTesting.general.description")}</p>
          </div>
        </div>
        <RatingField label={t("appTesting.overallRating")} value={draft.overallRating} onChange={(overallRating) => setDraft((current) => ({ ...current, overallRating }))} />
        <SelectField label={t("appTesting.mostUseful")} value={draft.mostUsefulArea} values={APP_TESTING_USEFUL_AREAS} t={t} prefix="appTesting.area" onChange={(mostUsefulArea) => setDraft((current) => ({ ...current, mostUsefulArea: mostUsefulArea as AppTestingDraft["mostUsefulArea"] }))} />
        <SelectField label={t("appTesting.useIntent")} value={draft.dailyUseIntent} values={APP_TESTING_USE_INTENTS} t={t} prefix="appTesting.intent" onChange={(dailyUseIntent) => setDraft((current) => ({ ...current, dailyUseIntent: dailyUseIntent as AppTestingDraft["dailyUseIntent"] }))} />
        <TextAreaField label={t("appTesting.mainDifficulty")} maxLength={1000} value={draft.mainDifficulty} onChange={(mainDifficulty) => setDraft((current) => ({ ...current, mainDifficulty }))} />
        <TextAreaField label={t("appTesting.privateComment")} hint={t("appTesting.privateHint")} maxLength={2000} value={draft.privateComment} onChange={(privateComment) => setDraft((current) => ({ ...current, privateComment }))} />
      </section>

      <section className="app-testing-section">
        <div className="app-testing-section-heading">
          <span>8</span>
          <div>
            <h4>{t("appTesting.project.title")}</h4>
            <p>{t("appTesting.project.description")}</p>
          </div>
        </div>
        <RatingField label={t("appTesting.missionRating")} value={draft.missionRating} onChange={(missionRating) => setDraft((current) => ({ ...current, missionRating }))} />
        <RatingField label={t("appTesting.projectClarity")} value={draft.projectClarityRating} onChange={(projectClarityRating) => setDraft((current) => ({ ...current, projectClarityRating }))} />
        <SelectField label={t("appTesting.attitude")} value={draft.attitude} values={APP_TESTING_ATTITUDES} t={t} prefix="appTesting.attitude" onChange={(attitude) => setDraft((current) => ({ ...current, attitude: attitude as AppTestingDraft["attitude"] }))} />
        <SelectField label={t("appTesting.strongest")} value={draft.strongestArea} values={APP_TESTING_STRENGTHS} t={t} prefix="appTesting.strength" onChange={(strongestArea) => setDraft((current) => ({ ...current, strongestArea: strongestArea as AppTestingDraft["strongestArea"] }))} />
        <SelectField label={t("appTesting.concern")} value={draft.mainConcern} values={APP_TESTING_CONCERNS} t={t} prefix="appTesting.concern" onChange={(mainConcern) => setDraft((current) => ({ ...current, mainConcern: mainConcern as AppTestingDraft["mainConcern"] }))} />
        <TextAreaField label={t("appTesting.publicReview")} hint={t("appTesting.publicHint")} maxLength={1500} value={draft.publicReview} onChange={(publicReview) => setDraft((current) => ({ ...current, publicReview }))} />
      </section>

      <section className="app-testing-preview">
        <span className="project-review-badge">{t("social.review.badge")}</span>
        <div className="app-testing-preview-author">
          <span>{author.avatarUrl ? <img alt="" src={author.avatarUrl} /> : <Smartphone size={18} />}</span>
          <strong>{author.displayName}</strong>
          <small>{t("app.common.level")} {author.level}</small>
        </div>
        <Stars value={draft.overallRating} />
        <p>{t("social.review.mission", { rating: draft.missionRating || "—" })}</p>
        <p>{draft.attitude ? t(`appTesting.attitude.${draft.attitude}` as MessageKey) : t("appTesting.choose")}</p>
        <p>{t("social.review.useful", {
          area: draft.mostUsefulArea
            ? t(`appTesting.area.${draft.mostUsefulArea}` as MessageKey)
            : t("appTesting.choose")
        })}</p>
        <blockquote>{draft.publicReview || t("appTesting.previewPlaceholder")}</blockquote>
        <small>{t("social.review.rewarded", { reward: rewardLabel })}</small>
      </section>

      <label className="app-testing-consent">
        <input
          type="checkbox"
          checked={draft.publicConsent}
          onChange={(event) => setDraft((current) => ({ ...current, publicConsent: event.target.checked }))}
        />
        <span>{t("appTesting.consent", { reward: rewardLabel })}</span>
      </label>

      {error ? <p className="challenge-error">{error}</p> : null}
      <button className="challenge-primary-action" type="button" disabled={status === "submitting"} onClick={() => { void submitFeedback(); }}>
        {status === "submitting" ? t("appTesting.submitting") : t("appTesting.submit", { reward: rewardLabel })}
      </button>
    </section>
  );
}

function InstallGuide({
  installPromptAvailable,
  isDesktop,
  platform,
  t,
  onInstall,
  onPlatformChange
}: {
  installPromptAvailable: boolean;
  isDesktop: boolean;
  locale: AppLocale;
  platform: AppTestingDraft["platform"];
  t: TFunction;
  onInstall: () => void;
  onPlatformChange: (platform: "ios" | "android") => void;
}) {
  const shownPlatform = platform === "ios" ? "ios" : "android";
  const steps = shownPlatform === "ios"
    ? [{ icon: Share2, key: "share" }, { icon: Smartphone, key: "home" }, { icon: House, key: "open" }]
    : [{ icon: MoreVertical, key: "menu" }, { icon: Download, key: "install" }, { icon: House, key: "open" }];
  return (
    <div className="app-testing-install-guide">
      <div className="app-testing-platform-tabs">
        <button className={shownPlatform === "ios" ? "active" : ""} type="button" onClick={() => onPlatformChange("ios")}>iOS</button>
        <button className={shownPlatform === "android" ? "active" : ""} type="button" onClick={() => onPlatformChange("android")}>Android</button>
      </div>
      <div className="install-visual-grid" role="img" aria-label={t(`appTesting.installGuide.${shownPlatform}` as MessageKey)}>
        {steps.map(({ icon: Icon, key }, index) => (
          <div className="install-visual-step" key={key}>
            <span>{index + 1}</span>
            <Icon size={26} />
            <small>{t(`appTesting.installStep.${shownPlatform}.${key}` as MessageKey)}</small>
          </div>
        ))}
      </div>
      {shownPlatform === "android" && installPromptAvailable ? (
        <button className="app-testing-open-area" type="button" onClick={onInstall}>{t("appTesting.installNow")}</button>
      ) : null}
      {isDesktop ? (
        <div className="app-testing-qr">
          <QRCodeSVG value={typeof window === "undefined" ? "/" : window.location.origin} size={132} level="M" marginSize={1} />
          <p>{t("appTesting.desktopQr")}</p>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeEditor({ answer, section, t, onChange }: {
  answer: AppTestingDraft["answers"][AppTestingSectionId];
  section: AppTestingSectionId;
  t: TFunction;
  onChange: (patch: Partial<AppTestingDraft["answers"][AppTestingSectionId]>) => void;
}) {
  return (
    <div className="app-testing-outcome">
      <div className="app-testing-choice-row">
        {APP_TESTING_OUTCOMES.map((outcome) => (
          <button className={answer.outcome === outcome ? "active" : ""} type="button" key={outcome} onClick={() => onChange({ outcome })}>
            {t(`appTesting.outcome.${outcome}` as MessageKey)}
          </button>
        ))}
      </div>
      <RatingField label={t("appTesting.sectionRating")} value={answer.rating} onChange={(rating) => onChange({ rating })} />
      <TextAreaField
        label={t("appTesting.sectionComment")}
        hint={answer.outcome && answer.outcome !== "worked" ? t("appTesting.commentRequired") : t("appTesting.commentOptional")}
        maxLength={1000}
        value={answer.comment}
        onChange={(comment) => onChange({ comment })}
      />
      <span className="sr-only">{section}</span>
    </div>
  );
}

function RatingField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="app-testing-rating">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button aria-label={`${rating}/5`} className={rating <= value ? "active" : ""} type="button" key={rating} onClick={() => onChange(rating)}>
            <Star size={20} fill={rating <= value ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Stars({ value }: { value: number }) {
  return <span className="project-review-stars" aria-label={`${value}/5`}>{[1, 2, 3, 4, 5].map((rating) => <Star size={17} fill={rating <= value ? "currentColor" : "none"} key={rating} />)}</span>;
}

function SelectField({ label, value, values, t, prefix, onChange }: {
  label: string;
  value: string;
  values: readonly string[];
  t: TFunction;
  prefix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="app-testing-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("appTesting.choose")}</option>
        {values.map((item) => <option value={item} key={item}>{t(`${prefix}.${item}` as MessageKey)}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, hint, maxLength, value, onChange }: {
  label: string;
  hint?: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="app-testing-field">
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
      <textarea maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      <small>{value.length}/{maxLength}</small>
    </label>
  );
}

function sectionTarget(section: AppTestingSectionId): AppTestingNavigationTarget {
  if (section === "home_today") return "home.home";
  if (section === "goals") return "goals.notes";
  if (section === "ai") return "spark";
  if (section === "wallet") return "wallet.core";
  return "people.feed";
}

function countCompletedSections(draft: AppTestingDraft): number {
  return APP_TESTING_SECTIONS.filter((section) => draft.answers[section].outcome && draft.answers[section].rating).length;
}

function readLocalDraft(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Sign in first.");
  return session.access_token;
}

function localizeValidationError(_message: string, t: TFunction): string {
  return t("appTesting.validation");
}
