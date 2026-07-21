import { NextRequest, NextResponse } from "next/server";
import {
  REFLECTION_PRACTICE_IDS,
  type ReflectionAlternative,
  type ReflectionCause,
  type ReflectionOutcomeKind,
  type ReflectionPracticeId,
  type ReflectionProposal,
  type ReflectionStepResponse
} from "@/lib/reflections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RequestAnswer = {
  questionId: string;
  question: string;
  answer: string;
};

type ReflectionRequest = {
  rawText?: string;
  answers?: RequestAnswer[];
  locale?: string;
};

const MAX_RAW_TEXT = 6_000;
const MAX_ANSWER_TEXT = 2_000;
const MAX_QUESTIONS = 3;
const OUTCOME_KINDS: ReflectionOutcomeKind[] = ["act_now", "wait", "accept", "learn", "ask_human"];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as ReflectionRequest | null;
  const rawText = cleanText(body?.rawText, MAX_RAW_TEXT);
  const locale = body?.locale === "ru" ? "ru" : "en";
  const answers = normalizeAnswers(body?.answers);

  if (!rawText) {
    return NextResponse.json({ error: "Reflection text is required." }, { status: 400 });
  }
  if (answers === null) {
    return NextResponse.json({ error: "Invalid reflection answers." }, { status: 400 });
  }

  if (hasImmediateSafetySignal(rawText, answers)) {
    return NextResponse.json(buildSafetyResponse(locale), { headers: noStoreHeaders() });
  }

  const prompt = buildPrompt(rawText, answers, locale);
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey && !groqKey) {
    return NextResponse.json({ error: "AI providers are not configured." }, { status: 503, headers: noStoreHeaders() });
  }

  let lastError: unknown;
  if (geminiKey) {
    try {
      const value = await callGemini(geminiKey, prompt);
      return NextResponse.json(validateModelResponse(value, answers.length, locale), { headers: noStoreHeaders() });
    } catch (error) {
      lastError = error;
      console.warn("Reflection processing provider failed; trying fallback.");
    }
  }

  if (groqKey) {
    try {
      const value = await callGroq(groqKey, prompt);
      return NextResponse.json(validateModelResponse(value, answers.length, locale), { headers: noStoreHeaders() });
    } catch (error) {
      lastError = error;
      console.warn("Reflection processing fallback failed.");
    }
  }

  if (answers.length >= MAX_QUESTIONS) {
    return NextResponse.json({ mode: "proposal", proposal: buildFallbackProposal(rawText, locale) }, { headers: noStoreHeaders() });
  }

  return NextResponse.json(
    { error: lastError instanceof Error ? "AI response could not be validated." : "AI service unavailable." },
    { status: 502, headers: noStoreHeaders() }
  );
}

function buildFallbackProposal(rawText: string, locale: "ru" | "en"): ReflectionProposal {
  const shortSummary = rawText.length > 500 ? `${rawText.slice(0, 497)}...` : rawText;
  if (locale === "ru") {
    return {
      summary: shortSummary,
      facts: [], thoughts: [], feelings: [], bodySignals: [], reactions: [],
      desiredOutcome: "Понять, на какую часть ситуации я могу повлиять.",
      causes: [{ id: "cause_1", text: "Возможная причина пока не подтверждена", rationale: "Ответов недостаточно для надёжного вывода — проверьте и исправьте эту гипотезу.", confirmed: false }],
      alternatives: [
        { title: "Проверить факты", description: "Отделить наблюдаемое от предположений." },
        { title: "Отложить решение", description: "Вернуться к нему в назначенное время, если сейчас не хватает данных." }
      ],
      resourcesHave: [], resourcesNeed: ["Один проверяемый факт о ситуации"], resourcesObtain: ["Записать или уточнить этот факт"],
      practiceId: "worry_tree", outcomeKind: "learn",
      nextAction: "Записать один факт, который можно проверить за 10 минут",
      ifThen: "Когда появятся 10 свободных минут, я проверю один факт и решу, нужен ли следующий шаг."
    };
  }
  return {
    summary: shortSummary,
    facts: [], thoughts: [], feelings: [], bodySignals: [], reactions: [],
    desiredOutcome: "Understand which part of the situation I can influence.",
    causes: [{ id: "cause_1", text: "The possible cause is not confirmed yet", rationale: "There is not enough information for a reliable conclusion; check and edit this hypothesis.", confirmed: false }],
    alternatives: [
      { title: "Check the facts", description: "Separate observations from assumptions." },
      { title: "Delay the decision", description: "Return at a set time if information is missing now." }
    ],
    resourcesHave: [], resourcesNeed: ["One verifiable fact about the situation"], resourcesObtain: ["Write down or clarify that fact"],
    practiceId: "worry_tree", outcomeKind: "learn",
    nextAction: "Write down one fact that can be checked in 10 minutes",
    ifThen: "When I have 10 free minutes, I will check one fact and decide whether another step is needed."
  };
}

function buildPrompt(rawText: string, answers: RequestAnswer[], locale: "ru" | "en"): string {
  const language = locale === "ru" ? "Russian" : "English";
  return `You are a careful self-reflection and decision-support assistant. Respond in ${language}.

This is not therapy or diagnosis. Never claim to know a "true", hidden, unconscious, or repressed cause. Causes are tentative hypotheses that the user must confirm. Never invent stories about similar people. Do not encourage dependency or endless analysis.

Your job is to move one private note toward a safe terminal outcome:
- act_now: a controllable, observable 5-15 minute action;
- wait: a specific check-back condition or time;
- accept: acknowledge a hypothetical/uncontrollable worry and choose a brief attention-shifting action;
- learn: a concrete research step using an authoritative source;
- ask_human: recommend a type of person, without contacting or selecting anyone.

Ask at most one useful question in this response and no more than ${MAX_QUESTIONS} questions in total. The user already answered ${answers.length}. If the note is clear enough or ${answers.length} is ${MAX_QUESTIONS}, return a proposal now. Do not ask for sensitive detail unless it is necessary for the next action.

Allowed practiceId values: ${REFLECTION_PRACTICE_IDS.join(", ")}.

Return only valid JSON, with exactly one of these shapes:
{"mode":"question","question":{"id":"short_ascii_id","text":"one question"}}
or
{"mode":"proposal","proposal":{"summary":"user-checkable summary","facts":["observable facts"],"thoughts":["interpretations"],"feelings":["feelings"],"bodySignals":[],"reactions":["actions or urges"],"desiredOutcome":"what the user wants","causes":[{"id":"cause_1","text":"possible cause","rationale":"why it may fit","confirmed":false}],"alternatives":[{"title":"option","description":"tradeoff"}],"resourcesHave":[],"resourcesNeed":[],"resourcesObtain":[],"practiceId":"one allowed id","outcomeKind":"act_now|wait|accept|learn|ask_human","nextAction":"controllable action starting with a verb","ifThen":"When/if X, I will Y","humanRecommendation":"only for ask_human, otherwise omit"}}

Keep arrays to 0-4 concise items, causes to 1-3, and alternatives to 2-3. Separate facts from interpretations. If another person's response is involved, the next action must be "write/call/ask", never obtaining the desired response.

PRIVATE NOTE:
${rawText}

ANSWERS:
${answers.length ? answers.map((item, index) => `${index + 1}. Q: ${item.question}\nA: ${item.answer}`).join("\n") : "None"}`;
}

async function callGemini(apiKey: string, prompt: string): Promise<unknown> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 1800, responseMimeType: "application/json" }
    })
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return parseJson(payload.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function callGroq(apiKey: string, prompt: string): Promise<unknown> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.25,
      max_tokens: 1800,
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseJson(payload.choices?.[0]?.message?.content);
}

function validateModelResponse(value: unknown, answerCount: number, locale: "ru" | "en"): ReflectionStepResponse {
  if (!isRecord(value)) throw new Error("AI response is not an object.");

  if (value.mode === "question" && answerCount < MAX_QUESTIONS && isRecord(value.question)) {
    const id = cleanAsciiId(value.question.id);
    const text = cleanText(value.question.text, 500);
    if (id && text) return { mode: "question", question: { id, text } };
  }

  if (value.mode !== "proposal" || !isRecord(value.proposal)) {
    throw new Error("AI response has no valid terminal proposal.");
  }

  const proposal = value.proposal;
  const summary = requiredText(proposal.summary, 1_200);
  const desiredOutcome = requiredText(proposal.desiredOutcome, 500);
  const nextAction = requiredText(proposal.nextAction, 500);
  const ifThen = requiredText(proposal.ifThen, 500);
  const practiceId = validatePracticeId(proposal.practiceId);
  const outcomeKind = validateOutcomeKind(proposal.outcomeKind);
  const causes = normalizeCauses(proposal.causes);
  const alternatives = normalizeAlternatives(proposal.alternatives);

  if (!summary || !desiredOutcome || !nextAction || !ifThen || !practiceId || !outcomeKind || causes.length === 0 || alternatives.length < 2) {
    throw new Error("AI proposal is incomplete.");
  }

  const result: ReflectionProposal = {
    summary,
    facts: normalizeStringArray(proposal.facts),
    thoughts: normalizeStringArray(proposal.thoughts),
    feelings: normalizeStringArray(proposal.feelings),
    bodySignals: normalizeStringArray(proposal.bodySignals),
    reactions: normalizeStringArray(proposal.reactions),
    desiredOutcome,
    causes,
    alternatives,
    resourcesHave: normalizeStringArray(proposal.resourcesHave),
    resourcesNeed: normalizeStringArray(proposal.resourcesNeed),
    resourcesObtain: normalizeStringArray(proposal.resourcesObtain),
    practiceId,
    outcomeKind,
    nextAction,
    ifThen,
    humanRecommendation: cleanText(proposal.humanRecommendation, 500) || undefined
  };

  if (outcomeKind === "ask_human" && !result.humanRecommendation) {
    result.humanRecommendation = locale === "ru" ? "Выберите подходящего доверенного человека или специалиста." : "Choose a suitable trusted person or professional.";
  }

  return { mode: "proposal", proposal: result };
}

function buildSafetyResponse(locale: "ru" | "en"): ReflectionStepResponse {
  if (locale === "ru") {
    return {
      mode: "safety",
      title: "Сейчас важнее безопасность",
      message: "Если есть риск, что вы причините вред себе или другому человеку, не оставайтесь с этим в одиночку. ИИ-разбор сейчас не подходит.",
      actions: [
        "Позвоните в местную экстренную службу или кризисную линию.",
        "Свяжитесь с человеком, которому доверяете, и попросите побыть рядом.",
        "Отойдите от предметов и мест, которые могут быть опасны."
      ]
    };
  }
  return {
    mode: "safety",
    title: "Safety comes first right now",
    message: "If you may harm yourself or someone else, do not handle this alone. AI reflection is not the right tool right now.",
    actions: [
      "Call your local emergency service or crisis line.",
      "Contact someone you trust and ask them to stay with you.",
      "Move away from objects or places that could be dangerous."
    ]
  };
}

function hasImmediateSafetySignal(rawText: string, answers: RequestAnswer[]): boolean {
  const text = `${rawText}\n${answers.map((answer) => answer.answer).join("\n")}`.toLocaleLowerCase();
  const patterns = [
    /(?:хочу|собираюсь|могу)\s+(?:убить|покончить|причинить вред)/u,
    /(?:покончу с собой|убью себя|суицид|не хочу жить)/u,
    /(?:i want to|i am going to|i might)\s+(?:kill|hurt)\s+(?:myself|someone)/u,
    /(?:suicide|end my life|don't want to live)/u
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeAnswers(value: unknown): RequestAnswer[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_QUESTIONS) return null;
  const answers: RequestAnswer[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const questionId = cleanAsciiId(item.questionId);
    const question = cleanText(item.question, 500);
    const answer = cleanText(item.answer, MAX_ANSWER_TEXT);
    if (!questionId || !question || !answer) return null;
    answers.push({ questionId, question, answer });
  }
  return answers;
}

function normalizeCauses(value: unknown): ReflectionCause[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const text = cleanText(item.text, 500);
    const rationale = cleanText(item.rationale, 500);
    if (!text || !rationale) return [];
    return [{ id: cleanAsciiId(item.id) || `cause_${index + 1}`, text, rationale, confirmed: false }];
  });
}

function normalizeAlternatives(value: unknown): ReflectionAlternative[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = cleanText(item.title, 240);
    const description = cleanText(item.description, 500);
    return title && description ? [{ title, description }] : [];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    const text = cleanText(item, 400);
    return text ? [text] : [];
  });
}

function validatePracticeId(value: unknown): ReflectionPracticeId | null {
  return typeof value === "string" && REFLECTION_PRACTICE_IDS.includes(value as ReflectionPracticeId)
    ? value as ReflectionPracticeId
    : null;
}

function validateOutcomeKind(value: unknown): ReflectionOutcomeKind | null {
  return typeof value === "string" && OUTCOME_KINDS.includes(value as ReflectionOutcomeKind)
    ? value as ReflectionOutcomeKind
    : null;
}

function parseJson(value: string | undefined): unknown {
  if (!value) throw new Error("Empty AI response.");
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function requiredText(value: unknown, maxLength: number): string {
  return cleanText(value, maxLength) ?? "";
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanAsciiId(value: unknown): string | null {
  const text = cleanText(value, 80);
  return text && /^[a-z0-9_-]+$/i.test(text) ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store"
  };
}
