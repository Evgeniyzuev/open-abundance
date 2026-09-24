import type { Json } from "@/lib/database.types";

export const APP_TESTING_CHALLENGE_ID = "03bfd7f2-6d8e-414a-a925-1181424eab45";
export const APP_TESTING_SCHEMA_VERSION = 1;
export const APP_TESTING_CONSENT_VERSION = "project_review_v1";

export const APP_TESTING_SECTIONS = ["install", "home_today", "goals", "ai", "wallet", "people"] as const;
export const APP_TESTING_OUTCOMES = ["worked", "partly", "failed", "unclear"] as const;
export const APP_TESTING_PLATFORMS = ["ios", "android", "desktop", "other"] as const;
export const APP_TESTING_INSTALL_OUTCOMES = ["installed_now", "already_installed", "failed", "not_available"] as const;
export const APP_TESTING_USEFUL_AREAS = ["today", "goals", "ai", "wallet", "people", "challenges", "other"] as const;
export const APP_TESTING_USE_INTENTS = ["yes", "probably", "unsure", "unlikely"] as const;
export const APP_TESTING_ATTITUDES = ["inspired", "interested_questions", "neutral", "skeptical", "not_aligned"] as const;
export const APP_TESTING_STRENGTHS = ["mission", "goals", "today", "ai", "core", "community", "other"] as const;
export const APP_TESTING_CONCERNS = ["complexity", "trust", "economics", "privacy", "unclear_value", "early_stage", "none", "other"] as const;

export type AppTestingSectionId = typeof APP_TESTING_SECTIONS[number];
export type AppTestingOutcome = typeof APP_TESTING_OUTCOMES[number];
export type AppTestingPlatform = typeof APP_TESTING_PLATFORMS[number];
export type AppTestingInstallOutcome = typeof APP_TESTING_INSTALL_OUTCOMES[number];
export type AppTestingUsefulArea = typeof APP_TESTING_USEFUL_AREAS[number];
export type AppTestingUseIntent = typeof APP_TESTING_USE_INTENTS[number];
export type AppTestingAttitude = typeof APP_TESTING_ATTITUDES[number];
export type AppTestingStrength = typeof APP_TESTING_STRENGTHS[number];
export type AppTestingConcern = typeof APP_TESTING_CONCERNS[number];

export type AppTestingSectionAnswer = {
  outcome: AppTestingOutcome | "";
  rating: number;
  comment: string;
};

export type AppTestingDraft = {
  schemaVersion: 1;
  platform: AppTestingPlatform;
  installOutcome: AppTestingInstallOutcome | "";
  answers: Record<AppTestingSectionId, AppTestingSectionAnswer>;
  overallRating: number;
  mostUsefulArea: AppTestingUsefulArea | "";
  dailyUseIntent: AppTestingUseIntent | "";
  mainDifficulty: string;
  privateComment: string;
  missionRating: number;
  projectClarityRating: number;
  attitude: AppTestingAttitude | "";
  strongestArea: AppTestingStrength | "";
  mainConcern: AppTestingConcern | "";
  publicReview: string;
  publicConsent: boolean;
  context: Record<string, Json>;
  status?: "draft" | "submitted";
  feedPostId?: string | null;
};

export function createEmptyAppTestingDraft(platform: AppTestingPlatform = "other"): AppTestingDraft {
  return {
    schemaVersion: APP_TESTING_SCHEMA_VERSION,
    platform,
    installOutcome: "",
    answers: Object.fromEntries(
      APP_TESTING_SECTIONS.map((section) => [section, { outcome: "", rating: 0, comment: "" }])
    ) as Record<AppTestingSectionId, AppTestingSectionAnswer>,
    overallRating: 0,
    mostUsefulArea: "",
    dailyUseIntent: "",
    mainDifficulty: "",
    privateComment: "",
    missionRating: 0,
    projectClarityRating: 0,
    attitude: "",
    strongestArea: "",
    mainConcern: "",
    publicReview: "",
    publicConsent: false,
    context: {},
    status: "draft",
    feedPostId: null
  };
}

export function normalizeAppTestingDraft(value: unknown, fallbackPlatform: AppTestingPlatform = "other"): AppTestingDraft {
  const source = isRecord(value) ? value : {};
  const draft = createEmptyAppTestingDraft(normalizeChoice(source.platform, APP_TESTING_PLATFORMS) ?? fallbackPlatform);
  const rawAnswers = isRecord(source.answers) ? source.answers : {};

  for (const section of APP_TESTING_SECTIONS) {
    const answer = isRecord(rawAnswers[section]) ? rawAnswers[section] : {};
    draft.answers[section] = {
      outcome: normalizeChoice(answer.outcome, APP_TESTING_OUTCOMES) ?? "",
      rating: normalizeRating(answer.rating),
      comment: normalizeText(answer.comment, 1000)
    };
  }

  draft.installOutcome = normalizeChoice(source.installOutcome ?? source.install_outcome, APP_TESTING_INSTALL_OUTCOMES) ?? "";
  draft.overallRating = normalizeRating(source.overallRating ?? source.overall_rating);
  draft.mostUsefulArea = normalizeChoice(source.mostUsefulArea ?? source.most_useful_area, APP_TESTING_USEFUL_AREAS) ?? "";
  draft.dailyUseIntent = normalizeChoice(source.dailyUseIntent ?? source.daily_use_intent, APP_TESTING_USE_INTENTS) ?? "";
  draft.mainDifficulty = normalizeText(source.mainDifficulty ?? source.main_difficulty, 1000);
  draft.privateComment = normalizeText(source.privateComment ?? source.private_comment, 2000);
  draft.missionRating = normalizeRating(source.missionRating ?? source.mission_rating);
  draft.projectClarityRating = normalizeRating(source.projectClarityRating ?? source.project_clarity_rating);
  draft.attitude = normalizeChoice(source.attitude, APP_TESTING_ATTITUDES) ?? "";
  draft.strongestArea = normalizeChoice(source.strongestArea ?? source.strongest_area, APP_TESTING_STRENGTHS) ?? "";
  draft.mainConcern = normalizeChoice(source.mainConcern ?? source.main_concern, APP_TESTING_CONCERNS) ?? "";
  draft.publicReview = normalizeText(source.publicReview ?? source.public_review, 1500);
  draft.publicConsent = source.publicConsent === true;
  draft.context = normalizeContext(source.context);
  draft.status = source.status === "submitted" ? "submitted" : "draft";
  draft.feedPostId = typeof (source.feedPostId ?? source.feed_post_id) === "string"
    ? String(source.feedPostId ?? source.feed_post_id)
    : null;
  return draft;
}

export function validateAppTestingSubmission(draft: AppTestingDraft): string | null {
  if (!draft.installOutcome) return "Choose the installation result.";

  for (const section of APP_TESTING_SECTIONS) {
    const answer = draft.answers[section];
    if (!answer.outcome) return "Complete every testing section.";
    if (answer.rating < 1 || answer.rating > 5) return "Rate every testing section from 1 to 5.";
    if (answer.outcome !== "worked" && !answer.comment.trim()) {
      return "Explain every partial, failed or unclear result.";
    }
  }

  if (draft.overallRating < 1 || draft.overallRating > 5) return "Rate the app from 1 to 5.";
  if (draft.missionRating < 1 || draft.missionRating > 5) return "Rate how close the mission feels from 1 to 5.";
  if (draft.projectClarityRating < 1 || draft.projectClarityRating > 5) return "Rate how clear the project is from 1 to 5.";
  if (!draft.mostUsefulArea) return "Choose the most useful area.";
  if (!draft.dailyUseIntent) return "Choose whether you plan to keep using the app.";
  if (!draft.attitude) return "Choose your attitude to the project.";
  if (!draft.strongestArea) return "Choose the project's strongest side.";
  if (!draft.mainConcern) return "Choose your main concern.";
  if (!draft.mainDifficulty.trim()) return "Describe the main difficulty or missing feature.";
  if (draft.privateComment.trim().length < 50) return "Write at least 50 characters in the private technical comment.";
  if (draft.publicReview.trim().length < 100) return "Write at least 100 characters in the public review.";
  if (!draft.publicConsent) return "Confirm publication of the review from your profile.";
  return null;
}

export function getAppTestingContext(): Record<string, Json> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    browser: detectBrowser(navigator.userAgent),
    locale: navigator.language.slice(0, 16),
    os: detectOs(navigator.userAgent),
    standalone,
    viewport: `${window.innerWidth}x${window.innerHeight}`
  };
}

export function detectAppTestingPlatform(): AppTestingPlatform {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
  if (/android/.test(userAgent)) return "android";
  if (/windows|macintosh|linux/.test(userAgent)) return "desktop";
  return "other";
}

function normalizeRating(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 0;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeChoice<const T extends readonly string[]>(value: unknown, choices: T): T[number] | null {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? value as T[number] : null;
}

function normalizeContext(value: unknown): Record<string, Json> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => [key.slice(0, 40), item as Json])
  );
}

function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "edge";
  if (/CriOS|Chrome\//.test(userAgent)) return "chrome";
  if (/FxiOS|Firefox\//.test(userAgent)) return "firefox";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

function detectOs(userAgent: string): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Windows/.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS/.test(userAgent)) return "macos";
  if (/Linux/.test(userAgent)) return "linux";
  return "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
