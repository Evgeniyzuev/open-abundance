export const REFLECTION_PRACTICE_IDS = [
  "thought_record",
  "worry_tree",
  "problem_solving",
  "reframing",
  "implementation_intention",
  "difficult_conversation",
  "professional_support"
] as const;

export type ReflectionPracticeId = (typeof REFLECTION_PRACTICE_IDS)[number];
export type ReflectionStatus = "inbox" | "clarifying" | "ready" | "planned" | "waiting" | "closed";
export type ReflectionOutcomeKind = "act_now" | "wait" | "accept" | "learn" | "ask_human";
export type ReflectionFeedback = "yes" | "partly" | "no";

export type ReflectionAnswer = {
  questionId: string;
  question: string;
  answer: string;
};

export type ReflectionCause = {
  id: string;
  text: string;
  rationale: string;
  confirmed: boolean;
};

export type ReflectionAlternative = {
  title: string;
  description: string;
};

export type ReflectionProposal = {
  summary: string;
  facts: string[];
  thoughts: string[];
  feelings: string[];
  bodySignals: string[];
  reactions: string[];
  desiredOutcome: string;
  causes: ReflectionCause[];
  alternatives: ReflectionAlternative[];
  resourcesHave: string[];
  resourcesNeed: string[];
  resourcesObtain: string[];
  practiceId: ReflectionPracticeId;
  outcomeKind: ReflectionOutcomeKind;
  nextAction: string;
  ifThen: string;
  humanRecommendation?: string;
};

export type ReflectionProcessing = {
  schemaVersion: 1;
  status: ReflectionStatus;
  answers: ReflectionAnswer[];
  questionCount: number;
  currentQuestion?: { id: string; text: string };
  proposal?: ReflectionProposal;
  linkedTaskId?: string;
  startedAt?: string;
  completedAt?: string;
  feedback?: ReflectionFeedback;
};

export type ReflectionStepResponse =
  | {
      mode: "question";
      question: { id: string; text: string };
      draft?: Partial<ReflectionProposal>;
    }
  | {
      mode: "proposal";
      proposal: ReflectionProposal;
    }
  | {
      mode: "safety";
      title: string;
      message: string;
      actions: string[];
    };

export type ReflectionTaskDraft = {
  sourceNoteId: string;
  title: string;
  description: string;
  remindAt?: string;
  nonce: number;
};

export type ReflectionPractice = {
  id: ReflectionPracticeId;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
  sourceUrl: string;
};

export const REFLECTION_PRACTICES: ReflectionPractice[] = [
  {
    id: "thought_record",
    title: { ru: "Дневник мыслей", en: "Thought record" },
    description: {
      ru: "Отделить ситуацию, мысль, чувство и реакцию, затем проверить другие объяснения.",
      en: "Separate the situation, thought, feeling, and reaction, then examine other explanations."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/thought-record/"
  },
  {
    id: "worry_tree",
    title: { ru: "Дерево тревоги", en: "Worry tree" },
    description: {
      ru: "Отличить решаемую проблему от гипотетической тревоги и выбрать действие или отпускание.",
      en: "Distinguish a solvable problem from hypothetical worry and choose action or letting go."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-worries/"
  },
  {
    id: "problem_solving",
    title: { ru: "Решение проблемы", en: "Problem solving" },
    description: {
      ru: "Определить контролируемую часть, сравнить варианты и проверить один небольшой шаг.",
      en: "Identify the controllable part, compare options, and test one small step."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/"
  },
  {
    id: "reframing",
    title: { ru: "Проверка интерпретации", en: "Reframing" },
    description: {
      ru: "Проверить факты за и против первой интерпретации и сформулировать более полезный взгляд.",
      en: "Check evidence for and against the first interpretation and form a more useful view."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/"
  },
  {
    id: "implementation_intention",
    title: { ru: "План «если — то»", en: "If-then plan" },
    description: {
      ru: "Связать конкретный момент или условие с одним наблюдаемым действием.",
      en: "Connect a specific moment or cue to one observable action."
    },
    sourceUrl: "https://bpspsychub.onlinelibrary.wiley.com/doi/10.1111/bjc.12086"
  },
  {
    id: "difficult_conversation",
    title: { ru: "Трудный разговор", en: "Difficult conversation" },
    description: {
      ru: "Сначала определить цель разговора, наблюдаемый факт, свою просьбу и подходящее время.",
      en: "Define the conversation goal, observable fact, request, and suitable time first."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-talk-about-your-mental-health/"
  },
  {
    id: "professional_support",
    title: { ru: "Профессиональная поддержка", en: "Professional support" },
    description: {
      ru: "Определить подходящего специалиста и сделать конкретный шаг для обращения.",
      en: "Identify the right professional and take a concrete step to contact them."
    },
    sourceUrl: "https://www.nhs.uk/every-mind-matters/mental-health-issues/"
  }
];

export function getReflectionPractice(id: ReflectionPracticeId): ReflectionPractice {
  return REFLECTION_PRACTICES.find((practice) => practice.id === id) ?? REFLECTION_PRACTICES[0];
}

export function createReflectionProcessing(): ReflectionProcessing {
  return {
    schemaVersion: 1,
    status: "inbox",
    answers: [],
    questionCount: 0
  };
}

export function normalizeReflectionProcessing(value: ReflectionProcessing | undefined): ReflectionProcessing | undefined {
  if (!value) return undefined;
  return {
    schemaVersion: 1,
    status: isReflectionStatus(value.status) ? value.status : "inbox",
    answers: Array.isArray(value.answers) ? value.answers.slice(0, 3) : [],
    questionCount: Math.min(3, Math.max(0, Number(value.questionCount) || 0)),
    currentQuestion: value.currentQuestion,
    proposal: value.proposal,
    linkedTaskId: value.linkedTaskId,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    feedback: value.feedback
  };
}

function isReflectionStatus(value: string): value is ReflectionStatus {
  return ["inbox", "clarifying", "ready", "planned", "waiting", "closed"].includes(value);
}
