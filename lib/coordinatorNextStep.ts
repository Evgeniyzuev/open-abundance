import type { ParticipantRecord } from "@/lib/coordinatorAnalysis";
import type { Localized } from "@/lib/locales";

/**
 * Pure rules for the "next step" push. No I/O so a deterministic Node test can check them
 * (`pnpm test:coordinator`).
 *
 * A person gets at most one push at a time, for the first basic step they have not done, never
 * the same step twice, and never more often than every few days. The text names one action and
 * where to find it. Nothing here touches money, Core or rewards.
 */

export type NextStepKey = "wish" | "calculator" | "accept_challenge" | "finish_challenge" | "invite";

export type NextStepCopy = { title: string; body: string };

export type NextStep = {
  key: NextStepKey;
  deepLink: string;
  /** English is required; a language without text reads English. */
  copy: Localized<NextStepCopy>;
};

const DAY_MS = 86_400_000;

/** A person is left alone for the first day after registering. */
export const NUDGE_MIN_AGE_MS = DAY_MS;
/** Minimum pause between two pushes to the same person. */
export const NUDGE_COOLDOWN_MS = 3 * DAY_MS;
/** Hard cap on coordinator pushes per person, for the whole pilot. */
export const NUDGE_MAX_PER_PERSON = 4;

export const NEXT_STEPS: Record<NextStepKey, NextStep> = {
  wish: {
    key: "wish",
    deepLink: "/?view=goals.desires",
    copy: {
      ru: { title: "Запишите одно желание", body: "Откройте «Желания» и добавьте то, чего хотите. Хватит одной строки. От желания зависят все следующие шаги." },
      en: { title: "Write down one wish", body: "Open Wishes and add something you want. One line is enough. Every next step builds on it." },
      es: { title: "Anota un deseo", body: "Abre Deseos y añade algo que quieras. Basta una línea. Todos los pasos siguientes parten de ahí." },
      zh: { title: "写下一个愿望", body: "打开“愿望”，添加你想要的东西，一句话就够了。之后的每一步都以它为基础。" },
      hi: { title: "एक इच्छा लिखें", body: "“इच्छाएँ” खोलें और कुछ ऐसा जोड़ें जो आप चाहते हैं। एक पंक्ति काफ़ी है। आगे का हर कदम इसी पर टिका है।" },
      ar: { title: "اكتب أمنية واحدة", body: "افتح «الأمنيات» وأضف شيئًا تريده. يكفي سطر واحد. كل خطوة تالية تبنى عليها." }
    }
  },
  calculator: {
    key: "calculator",
    deepLink: "/?view=wallet.core",
    copy: {
      ru: { title: "Узнайте срок до своей цели", body: "Откройте «Рост» → Core, выберите режим и посмотрите, за сколько вырастет ваш Core. Это займёт минуту." },
      en: { title: "See how long your goal takes", body: "Open Growth → Core, pick a mode and see how fast your Core grows. It takes a minute." },
      es: { title: "Descubre cuánto falta para tu meta", body: "Abre Crecimiento → Core, elige un modo y mira a qué ritmo crece tu Core. Lleva un minuto." },
      zh: { title: "看看距离目标还要多久", body: "打开“成长”→ Core，选择一种模式，看看你的 Core 增长有多快。只需一分钟。" },
      hi: { title: "जानें लक्ष्य में कितना समय लगेगा", body: "“विकास” → Core खोलें, एक मोड चुनें और देखें कि आपका Core कितनी तेज़ी से बढ़ता है। इसमें एक मिनट लगता है।" },
      ar: { title: "اعرف كم يستغرق هدفك", body: "افتح «النمو» ← Core، واختر وضعًا وانظر بأي سرعة ينمو Core لديك. يستغرق ذلك دقيقة." }
    }
  },
  accept_challenge: {
    key: "accept_challenge",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "Возьмите первый челлендж", body: "Откройте «Челленджи» и выберите самый простой. Первый выполненный челлендж приносит первый Core." },
      en: { title: "Take your first challenge", body: "Open Challenges and pick the easiest one. Your first finished challenge brings your first Core." },
      es: { title: "Acepta tu primer reto", body: "Abre Retos y elige el más sencillo. Tu primer reto completado te trae tu primer Core." },
      zh: { title: "接受你的第一个挑战", body: "打开“挑战”，选一个最简单的。完成的第一个挑战会带来你的第一份 Core。" },
      hi: { title: "अपनी पहली चुनौती लें", body: "“चुनौतियाँ” खोलें और सबसे आसान चुनें। आपकी पहली पूरी की गई चुनौती आपको पहला Core दिलाती है।" },
      ar: { title: "اقبل أول تحدٍّ لك", body: "افتح «التحديات» واختر أسهلها. أول تحدٍّ تكمله يمنحك أول Core." }
    }
  },
  finish_challenge: {
    key: "finish_challenge",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "Доведите челлендж до конца", body: "Вы уже взяли челлендж. Откройте его, сделайте шаг и отметьте результат." },
      en: { title: "Finish your challenge", body: "You already took a challenge. Open it, do one step and mark the result." },
      es: { title: "Termina tu reto", body: "Ya aceptaste un reto. Ábrelo, da un paso y marca el resultado." },
      zh: { title: "把挑战完成", body: "你已经接受了一个挑战。打开它，迈出一步，并标记结果。" },
      hi: { title: "अपनी चुनौती पूरी करें", body: "आप पहले ही एक चुनौती ले चुके हैं। उसे खोलें, एक कदम उठाएँ और नतीजा चिह्नित करें।" },
      ar: { title: "أكمل تحدّيك", body: "لقد قبلت تحدّيًا بالفعل. افتحه، وخذ خطوة واحدة، وسجّل النتيجة." }
    }
  },
  invite: {
    key: "invite",
    deepLink: "/?view=people.profile",
    copy: {
      ru: { title: "Позовите одного знакомого", body: "В профиле есть ваша ссылка-приглашение. Отправьте её человеку, которому приложение может пригодиться." },
      en: { title: "Invite one person you know", body: "Your invitation link is in your profile. Send it to someone the app could help." },
      es: { title: "Invita a una persona que conozcas", body: "Tu enlace de invitación está en tu perfil. Envíaselo a alguien a quien la app pueda ayudar." },
      zh: { title: "邀请一位你认识的人", body: "你的邀请链接在个人资料里。把它发给一位这个应用能帮到的人。" },
      hi: { title: "किसी परिचित को आमंत्रित करें", body: "आपका आमंत्रण लिंक आपकी प्रोफ़ाइल में है। इसे किसी ऐसे व्यक्ति को भेजें जिसकी यह ऐप मदद कर सके।" },
      ar: { title: "ادعُ شخصًا تعرفه", body: "رابط دعوتك موجود في ملفك الشخصي. أرسله إلى شخص قد يساعده التطبيق." }
    }
  }
};

/** The first basic step this person has not completed, or null when none applies yet. */
export function nextStepFor(participant: ParticipantRecord, now: number): NextStep | null {
  if (now - Date.parse(participant.registeredAt) < NUDGE_MIN_AGE_MS) return null;
  if (participant.wishes === 0) return NEXT_STEPS.wish;
  if (!participant.calculatorUsed) return NEXT_STEPS.calculator;
  if (participant.challengesAccepted === 0) return NEXT_STEPS.accept_challenge;
  if (participant.challengesCompleted === 0) return NEXT_STEPS.finish_challenge;
  if (participant.referralsInvited === 0) return NEXT_STEPS.invite;
  return null;
}

export type NudgeHistory = { lastAt: number; steps: Set<string>; count: number };

export type NudgeCandidate = { userId: string; step: NextStep };

/**
 * Applies the pacing rules: one push per step, a pause between pushes, a lifetime cap.
 * `history` is keyed by user id and built from earlier coordinator pushes.
 */
export function planNudges(
  participants: ParticipantRecord[],
  history: Map<string, NudgeHistory>,
  now: number,
  limit: number
): NudgeCandidate[] {
  const planned: NudgeCandidate[] = [];
  for (const participant of participants) {
    if (planned.length >= limit) break;
    const step = nextStepFor(participant, now);
    if (!step) continue;
    const past = history.get(participant.id);
    if (past) {
      if (past.steps.has(step.key)) continue;
      if (past.count >= NUDGE_MAX_PER_PERSON) continue;
      if (now - past.lastAt < NUDGE_COOLDOWN_MS) continue;
    }
    planned.push({ userId: participant.id, step });
  }
  return planned;
}

export const NUDGE_EVENT_TYPE = "coach.next_step";

export function nudgeIdempotencyKey(step: NextStepKey, userId: string): string {
  return `coach-next-step:${step}:${userId}`;
}

/** Reads a user and step back out of an idempotency key; null for keys of another kind. */
export function parseNudgeKey(key: string): { step: string; userId: string } | null {
  const match = /^coach-next-step:([a-z_]+):([0-9a-f-]{36})$/.exec(key);
  return match ? { step: match[1], userId: match[2] } : null;
}

// --- When to send -----------------------------------------------------------------------------------

/** Local hours (inclusive start, exclusive end) in which a nudge may be sent. */
export const NUDGE_WINDOW_START_HOUR = 10;
export const NUDGE_WINDOW_END_HOUR = 19;

/**
 * True when it is daytime for the person. `timezone` is an IANA name saved from their browser; without a valid one
 * the window falls back to 13:00-17:00 UTC (early evening for most of the pilot).
 */
export function isNudgeSendTime(timezone: string | null | undefined, now: number): boolean {
  if (timezone) {
    try {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(now)));
      return hour >= NUDGE_WINDOW_START_HOUR && hour < NUDGE_WINDOW_END_HOUR;
    } catch {
      // An unknown time zone name: use the default window below.
    }
  }
  const utcHour = new Date(now).getUTCHours();
  return utcHour >= 13 && utcHour < 17;
}

// --- Results ----------------------------------------------------------------------------------------

export type NudgeOutcomes = Record<string, { sent: number; done: number }>;

function stepDone(participant: ParticipantRecord, step: string): boolean {
  if (step === "wish") return participant.wishes > 0;
  if (step === "calculator") return participant.calculatorUsed;
  if (step === "accept_challenge") return participant.challengesAccepted > 0;
  if (step === "finish_challenge") return participant.challengesCompleted > 0;
  if (step === "invite") return participant.referralsInvited > 0;
  return false;
}

/**
 * Per step: how many people were nudged and how many of them have done that step since. A person is nudged for a step
 * only while it is not done, so "done now" means "done after the nudge". Pure; the coordinator shows it to the operator.
 */
export function nudgeOutcomes(participants: ParticipantRecord[], sent: Array<{ userId: string; step: string }>): NudgeOutcomes {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const result: NudgeOutcomes = {};
  for (const { userId, step } of sent) {
    const entry = (result[step] ??= { sent: 0, done: 0 });
    entry.sent += 1;
    const participant = byId.get(userId);
    if (participant && stepDone(participant, step)) entry.done += 1;
  }
  return result;
}
