import type { ParticipantRecord } from "@/lib/coordinatorAnalysis";
import type { Localized } from "@/lib/locales";
import { QUEST_NUDGE_WEEK_LIMIT, chooseFirstDayHook, chooseQuestNudge, weekSends, type QuestNudgeInput, type QuestNudgeKey } from "./questNudges.ts";
import { MEETING_DEEP_LINK, meetingInviteCopy, shouldInviteToMeeting, type MeetingInviteInput } from "./leadMeetings.ts";

/**
 * Pure rules for the coordinator's daily message. No I/O so a deterministic Node test can check them
 * (`pnpm test:coordinator`).
 *
 * Founder decision 2026-10-24: at most one message a day. The first one tells the person how much is in their Core,
 * then come the basic steps they have not done, then "tasks for today" (up to $10 of rewards). After a few messages the
 * person did not open the app for, the coordinator goes quiet until they come back. Copy carries {name}, {core},
 * {tasks} and {amount}, filled per person with `fillNudgeCopy`. Nothing here pays anyone.
 */

export type BasicStepKey = "core" | "wish" | "calculator" | "accept_challenge" | "finish_challenge" | "invite" | "tasks";
/** Basic steps plus Nova's messages about the growth path (lib/questNudges.ts). */
export type NextStepKey = BasicStepKey | QuestNudgeKey | "lead_meeting";

export type NextStepCopy = { title: string; body: string; button: string };

export type NextStep = {
  key: NextStepKey;
  deepLink: string;
  /** English is required; a language without text reads English. */
  copy: Localized<NextStepCopy>;
};

const DAY_MS = 86_400_000;

/** A person is left alone for the first day after registering. */
export const NUDGE_MIN_AGE_MS = DAY_MS;
/** One message a day; a little under 24 hours so the hourly job keeps roughly the same local time. */
export const NUDGE_COOLDOWN_MS = 20 * 3_600_000;
/** Messages in a row without the person opening the app, after which the coordinator waits for them to come back. */
export const NUDGE_PAUSE_AFTER = 3;
/** A basic step is asked about at most this often, with this gap between the two asks. */
export const NUDGE_STEP_REPEATS = 2;
export const NUDGE_STEP_GAP_MS = 3 * DAY_MS;
/** Safety cap on coordinator messages per person, for the whole pilot. */
export const NUDGE_MAX_PER_PERSON = 30;
/** In quest mode the Core balance message comes back after this gap (within the weekly limit). */
export const CORE_REPEAT_GAP_MS = 3 * DAY_MS;
/** "Tasks for today" add up to at most this many dollars of rewards (founder decision 2026-10-24). */
export const TODAY_TASKS_MAX_USD = 10;
export const TODAY_TASKS_MAX_COUNT = 6;

export const NEXT_STEPS: Record<BasicStepKey, NextStep> = {
  core: {
    key: "core",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "{name}, у тебя {core} в Core", body: "Core приносит доход каждый день. Загляни за доходом и новыми наградами.", button: "Открыть квесты" },
      en: { title: "{name}, you have {core} in Core", body: "Core brings income every day. Come in for your income and new rewards.", button: "Open quests" },
      es: { title: "{name}, tienes {core} en Core", body: "Core te da ingresos cada día. Entra a ver tus ingresos y nuevas recompensas.", button: "Abrir misiones" },
      zh: { title: "{name}，你的 Core 里有 {core}", body: "Core 每天都带来收入。来看看你的收入和新的奖励。", button: "打开任务" },
      hi: { title: "{name}, आपके Core में {core} हैं", body: "Core हर दिन आय देता है। अपनी आय और नए इनाम देखने आइए।", button: "क्वेस्ट खोलें" },
      ar: { title: "{name}، لديك {core} في Core", body: "يجلب Core دخلًا كل يوم. ادخل لترى دخلك ومكافآت جديدة.", button: "افتح المهام" }
    }
  },
  wish: {
    key: "wish",
    deepLink: "/?view=goals.desires",
    copy: {
      ru: { title: "{name}, чего ты хочешь больше всего?", body: "Запиши одно желание, хватит одной строки. Задания будут подбираться под него.", button: "Записать желание" },
      en: { title: "{name}, what do you want most?", body: "Write down one wish, a single line is enough. Tasks will be picked around it.", button: "Add a wish" },
      es: { title: "{name}, ¿qué es lo que más quieres?", body: "Anota un deseo, basta una línea. Las tareas se elegirán en torno a él.", button: "Anotar deseo" },
      zh: { title: "{name}，你最想要什么？", body: "写下一个愿望，一句话就够。之后的任务会围绕它来挑选。", button: "写下愿望" },
      hi: { title: "{name}, आप सबसे ज़्यादा क्या चाहते हैं?", body: "एक इच्छा लिखें, एक पंक्ति काफ़ी है। काम उसी के हिसाब से चुने जाएँगे।", button: "इच्छा लिखें" },
      ar: { title: "{name}، ما الذي تريده أكثر من أي شيء؟", body: "اكتب أمنية واحدة، يكفي سطر. ستُختار المهام حولها.", button: "اكتب أمنية" }
    }
  },
  calculator: {
    key: "calculator",
    deepLink: "/?view=wallet.core",
    copy: {
      ru: { title: "{name}, когда сбудется твоё желание?", body: "Калькулятор Core за минуту покажет срок и что его сокращает.", button: "Посчитать" },
      en: { title: "{name}, when will your wish come true?", body: "The Core calculator shows the date in a minute, and what brings it closer.", button: "Calculate" },
      es: { title: "{name}, ¿cuándo se cumplirá tu deseo?", body: "La calculadora de Core te muestra la fecha en un minuto y qué la acerca.", button: "Calcular" },
      zh: { title: "{name}，你的愿望什么时候能实现？", body: "Core 计算器一分钟就能算出日期，以及怎样让它更早到来。", button: "算一算" },
      hi: { title: "{name}, आपकी इच्छा कब पूरी होगी?", body: "Core कैलकुलेटर एक मिनट में तारीख दिखाता है और बताता है कि उसे क्या पास लाता है।", button: "हिसाब लगाएँ" },
      ar: { title: "{name}، متى ستتحقق أمنيتك؟", body: "تُظهر حاسبة Core الموعد في دقيقة، وما الذي يقرّبه.", button: "احسب" }
    }
  },
  accept_challenge: {
    key: "accept_challenge",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "{name}, первый челлендж займёт пару минут", body: "Выбери самый простой в «Челленджах». За каждый выполненный приходит Core.", button: "Выбрать челлендж" },
      en: { title: "{name}, your first challenge takes a couple of minutes", body: "Pick the easiest one in Challenges. Every finished challenge adds Core.", button: "Pick a challenge" },
      es: { title: "{name}, tu primer reto lleva un par de minutos", body: "Elige el más sencillo en Retos. Cada reto completado suma Core.", button: "Elegir reto" },
      zh: { title: "{name}，第一个挑战只需几分钟", body: "在“挑战”里选最简单的一个。每完成一个挑战都会增加 Core。", button: "选择挑战" },
      hi: { title: "{name}, पहली चुनौती में बस कुछ मिनट लगेंगे", body: "“चुनौतियाँ” में सबसे आसान चुनें। हर पूरी की गई चुनौती Core बढ़ाती है।", button: "चुनौती चुनें" },
      ar: { title: "{name}، أول تحدٍّ يستغرق دقيقتين", body: "اختر الأسهل في «التحديات». كل تحدٍّ مكتمل يضيف إلى Core.", button: "اختر تحدّيًا" }
    }
  },
  finish_challenge: {
    key: "finish_challenge",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "{name}, твой челлендж ждёт", body: "Открой его, сделай следующий шаг и проверь выполнение. Награда придёт в Core.", button: "Продолжить" },
      en: { title: "{name}, your challenge is waiting", body: "Open it, do the next step and check the result. The reward goes to Core.", button: "Continue" },
      es: { title: "{name}, tu reto te espera", body: "Ábrelo, da el siguiente paso y comprueba el resultado. La recompensa va a Core.", button: "Continuar" },
      zh: { title: "{name}，你的挑战在等你", body: "打开它，完成下一步并检查结果。奖励会进入 Core。", button: "继续" },
      hi: { title: "{name}, आपकी चुनौती इंतज़ार कर रही है", body: "उसे खोलें, अगला कदम उठाएँ और नतीजा जाँचें। इनाम Core में आएगा।", button: "जारी रखें" },
      ar: { title: "{name}، تحدّيك بانتظارك", body: "افتحه، وأنجز الخطوة التالية وتحقّق من النتيجة. تذهب المكافأة إلى Core.", button: "تابِع" }
    }
  },
  invite: {
    key: "invite",
    deepLink: "/?view=people.profile",
    copy: {
      ru: { title: "{name}, кому из знакомых это пригодится?", body: "Отправь свою ссылку из профиля одному человеку. За каждого подтверждённого приглашённого приходит до $2.", button: "Пригласить" },
      en: { title: "{name}, who do you know that could use this?", body: "Send the link from your profile to one person. Each confirmed invitee brings up to $2.", button: "Invite" },
      es: { title: "{name}, ¿a quién conoces que le sirva esto?", body: "Envía el enlace de tu perfil a una persona. Cada invitado confirmado aporta hasta $2.", button: "Invitar" },
      zh: { title: "{name}，你认识的人里谁用得上？", body: "把个人资料里的链接发给一个人。每位确认的受邀者最多带来 $2。", button: "邀请" },
      hi: { title: "{name}, आपके किस परिचित के यह काम आएगा?", body: "प्रोफ़ाइल से अपना लिंक किसी एक व्यक्ति को भेजें। हर पुष्टि किए गए आमंत्रित से $2 तक मिलते हैं।", button: "आमंत्रित करें" },
      ar: { title: "{name}، من تعرف قد يستفيد من هذا؟", body: "أرسل رابطك من ملفك الشخصي إلى شخص واحد. كل مدعوّ مؤكَّد يجلب حتى 2 $.", button: "ادعُ" }
    }
  },
  tasks: {
    key: "tasks",
    deepLink: "/?view=challenges",
    copy: {
      ru: { title: "{name}, на сегодня для тебя {tasks}", body: "Вместе это до +{amount}. Первое займёт пару минут.", button: "Посмотреть задания" },
      en: { title: "{name}, you have {tasks} for today", body: "Together they bring up to +{amount}. The first takes a couple of minutes.", button: "See the tasks" },
      es: { title: "{name}, hoy tienes {tasks}", body: "Juntas suman hasta +{amount}. La primera lleva un par de minutos.", button: "Ver tareas" },
      zh: { title: "{name}，今天有 {tasks} 等着你", body: "加起来最多 +{amount}。第一个只需几分钟。", button: "查看任务" },
      hi: { title: "{name}, आज आपके लिए {tasks} हैं", body: "सब मिलाकर +{amount} तक। पहला काम बस कुछ मिनट का है।", button: "काम देखें" },
      ar: { title: "{name}، لديك اليوم {tasks}", body: "معًا تصل إلى +{amount}. الأولى تستغرق دقيقتين.", button: "اعرض المهام" }
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

// --- Tasks for today ----------------------------------------------------------------------------------

export type TaskChallenge = {
  id: string;
  sortOrder: number;
  coreReward: number;
  walletReward: number;
  verificationLogic: string | null;
  trackKey: string | null;
  trackStep: number | null;
  prerequisiteId: string | null;
  rewardMode: string | null;
  competitionClosesAt: string | null;
};

export type TodayTasks = { count: number; amount: number; challengeIds: string[] };

/** Challenges a person can finish in one sitting, without money or other people (sales, top-ups and streaks are out). */
export const QUICK_TASK_LOGIC = new Set([
  "attention_value_audit",
  "core_law_understood",
  "has_wish",
  "values_goals_defined",
  "calculate_time_to_goal",
  "today_core_target_reached",
  "niche_task_chosen",
  "humanity_confirmed",
  "ai_message_sent",
  "skill_profile_completed",
  "ai_essay_review",
  "first_growth_post_published"
]);

/**
 * Quick challenges this person has not finished, in the app's order, while their rewards together stay within $10.
 * Within a track only the first unfinished step counts; a challenge behind an unfinished prerequisite is skipped.
 */
export function pickTodayTasks(challenges: TaskChallenge[], doneIds: Set<string>): TodayTasks {
  const nextStepOfTrack = new Map<string, number>();
  for (const challenge of challenges) {
    if (!challenge.trackKey || challenge.trackStep === null || doneIds.has(challenge.id)) continue;
    const current = nextStepOfTrack.get(challenge.trackKey);
    if (current === undefined || challenge.trackStep < current) nextStepOfTrack.set(challenge.trackKey, challenge.trackStep);
  }
  const picked: TaskChallenge[] = [];
  let amount = 0;
  for (const challenge of [...challenges].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (picked.length >= TODAY_TASKS_MAX_COUNT) break;
    const reward = challenge.coreReward + challenge.walletReward;
    if (doneIds.has(challenge.id) || reward <= 0 || !QUICK_TASK_LOGIC.has(challenge.verificationLogic ?? "")) continue;
    if ((challenge.rewardMode ?? "guaranteed") !== "guaranteed" || challenge.competitionClosesAt) continue;
    if (challenge.prerequisiteId && !doneIds.has(challenge.prerequisiteId)) continue;
    if (challenge.trackKey && challenge.trackStep !== null && nextStepOfTrack.get(challenge.trackKey) !== challenge.trackStep) continue;
    if (amount + reward > TODAY_TASKS_MAX_USD + 1e-9) continue;
    picked.push(challenge);
    amount += reward;
  }
  return { count: picked.length, amount: Math.round(amount * 100) / 100, challengeIds: picked.map((challenge) => challenge.id) };
}

// --- Filling the copy ---------------------------------------------------------------------------------

export function formatUsd(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

/** "3 задания", "5 tasks": the number of tasks in the person's language. */
export function tasksPhrase(locale: string, count: number): string {
  if (locale === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "задание" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "задания" : "заданий";
    return `${count} ${word}`;
  }
  if (locale === "es") return `${count} ${count === 1 ? "tarea" : "tareas"}`;
  if (locale === "zh") return `${count} 个任务`;
  if (locale === "hi") return `${count} काम`;
  if (locale === "ar") return count === 1 ? "مهمة واحدة" : count === 2 ? "مهمتان" : count <= 10 ? `${count} مهام` : `${count} مهمة`;
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

export type NudgeValues = { name: string | null; core: number; tasks: TodayTasks | null };

/**
 * The step's copy with the person's values in every language. Without a name the "{name}, " opening is dropped and the
 * sentence starts with a capital letter.
 */
export function fillNudgeCopy(copy: Localized<NextStepCopy>, values: NudgeValues): Localized<NextStepCopy> {
  const name = values.name?.trim().slice(0, 40) || null;
  const result: Record<string, NextStepCopy> = {};
  for (const [locale, text] of Object.entries(copy) as Array<[string, NextStepCopy]>) {
    const fill = (template: string) => {
      const opened = name ? template : template.replace(/^\{name\}[,，،]\s*/, "");
      const filled = opened
        .replace(/\{name\}/g, name ?? "")
        .replace(/\{core\}/g, formatUsd(values.core))
        .replace(/\{tasks\}/g, tasksPhrase(locale, values.tasks?.count ?? 0))
        .replace(/\{amount\}/g, formatUsd(values.tasks?.amount ?? 0));
      return name ? filled : filled.charAt(0).toUpperCase() + filled.slice(1);
    };
    result[locale] = { title: fill(text.title), body: fill(text.body), button: text.button };
  }
  return result as Localized<NextStepCopy>;
}

// --- Choosing today's message -------------------------------------------------------------------------

export type NudgeSend = { step: string; at: number };

export type NudgeHistory = { sends: NudgeSend[] };

export type NudgeCandidate = { userId: string; step: NextStep };

/** What the coordinator knows about one person beyond their record: Core balance and tasks open for today. */
export type NudgeContext = {
  tasks: TodayTasks | null;
  lastActiveAt: number | null;
  /** Set unless QUEST_NUDGES_ENABLED=0: the path decides, three messages a week at most, no separate basic steps. */
  quest?: QuestNudgeInput | null;
  /** Set for people who chose a rhythm of meetings with the lead (lib/leadMeetings.ts). */
  meeting?: (MeetingInviteInput & { lastMeetingAt: number | null }) | null;
};

/**
 * Today's message for one person, or null: nothing in the first day, at most one a day, quiet after
 * NUDGE_PAUSE_AFTER messages they did not open the app for. Order: Core balance (once), the first unmet basic step
 * (twice at most, NUDGE_STEP_GAP_MS apart), then tasks for today.
 */
export function chooseNudge(participant: ParticipantRecord, past: NudgeHistory | undefined, context: NudgeContext, now: number): NextStep | null {
  // The first day is quiet except for the path's hook for tomorrow (founder decision 2026-10-26).
  if (context.quest && now - Date.parse(participant.registeredAt) < NUDGE_MIN_AGE_MS) {
    return chooseFirstDayHook(context.quest, past?.sends ?? [], Date.parse(participant.registeredAt), context.lastActiveAt, now);
  }
  if (now - Date.parse(participant.registeredAt) < NUDGE_MIN_AGE_MS) return null;
  const sends = past?.sends ?? [];
  if (sends.length >= NUDGE_MAX_PER_PERSON) return null;
  const last = sends.reduce<NudgeSend | null>((latest, send) => (!latest || send.at > latest.at ? send : latest), null);
  if (last && now - last.at < NUDGE_COOLDOWN_MS) return null;
  const unanswered = sends.filter((send) => context.lastActiveAt === null || send.at > context.lastActiveAt).length;
  if (unanswered >= NUDGE_PAUSE_AFTER) return null;

  // The person asked for meetings with the lead: on a meeting day the invitation comes first.
  if (context.meeting && shouldInviteToMeeting(context.meeting, sends, context.meeting.lastMeetingAt, now)) {
    return { key: "lead_meeting", deepLink: MEETING_DEEP_LINK, copy: meetingInviteCopy(context.meeting) };
  }

  if (context.quest) {
    // The path covers the basic steps (wish, calculator, first quest), so only Core and tasks for today remain.
    const questNudge = chooseQuestNudge(context.quest, sends, context.lastActiveAt, now);
    if (questNudge) return questNudge;
    if (weekSends(sends, now) >= QUEST_NUDGE_WEEK_LIMIT) return null;
    // The Core balance with an invitation to come for income and new rewards, again every few days (Evgen, 2026-10-27).
    if (participant.coreBalance >= 0.01 && sends.every((send) => send.step !== "core" || now - send.at >= CORE_REPEAT_GAP_MS)) return NEXT_STEPS.core;
    return context.tasks && context.tasks.count > 0 ? NEXT_STEPS.tasks : null;
  }
  if (participant.coreBalance >= 0.01 && !sends.some((send) => send.step === "core")) return NEXT_STEPS.core;
  const basic = nextStepFor(participant, now);
  if (basic) {
    const asked = sends.filter((send) => send.step === basic.key);
    if (asked.length < NUDGE_STEP_REPEATS && asked.every((send) => now - send.at >= NUDGE_STEP_GAP_MS)) return basic;
  }
  if (context.tasks && context.tasks.count > 0) return NEXT_STEPS.tasks;
  return null;
}

/** Applies `chooseNudge` to everyone, up to `limit`. `history` is keyed by user id, built from earlier messages. */
export function planNudges(
  participants: ParticipantRecord[],
  history: Map<string, NudgeHistory>,
  now: number,
  limit: number,
  contextFor: (userId: string) => NudgeContext = () => ({ tasks: null, lastActiveAt: null })
): NudgeCandidate[] {
  const planned: NudgeCandidate[] = [];
  for (const participant of participants) {
    if (planned.length >= limit) break;
    const step = chooseNudge(participant, history.get(participant.id), contextFor(participant.id), now);
    if (step) planned.push({ userId: participant.id, step });
  }
  return planned;
}

export const NUDGE_EVENT_TYPE = "coach.next_step";

/** One key per step, person and UTC day: a repeat on another day is allowed, a double send the same day is not. */
export function nudgeIdempotencyKey(step: NextStepKey, userId: string, now: number): string {
  return `coach-next-step:${step}:${userId}:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Reads a user and step back out of an idempotency key (with or without the day); null for keys of another kind. */
export function parseNudgeKey(key: string): { step: string; userId: string } | null {
  const match = /^coach-next-step:([a-z_]+):([0-9a-f-]{36})(?::\d{4}-\d{2}-\d{2})?$/.exec(key);
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

/** Per step: messages sent, how many people did the step since, how many opened the app after the message. */
export type NudgeOutcomes = Record<string, { sent: number; done: number; opened: number }>;

function stepDone(participant: ParticipantRecord, step: string): boolean {
  if (step === "wish") return participant.wishes > 0;
  if (step === "calculator" || step === "core") return participant.calculatorUsed;
  if (step === "accept_challenge") return participant.challengesAccepted > 0;
  if (step === "finish_challenge" || step === "tasks") return participant.challengesCompleted > 0;
  if (step === "invite") return participant.referralsInvited > 0;
  return false;
}

/**
 * Per step: how many messages went out, how many of those people have done the step since, and how many opened the
 * app after the message. A person is nudged for a step only while it is not done, so "done now" means "done after the
 * nudge". Pure; the coordinator shows it to the operator.
 */
export function nudgeOutcomes(participants: ParticipantRecord[], sent: Array<{ userId: string; step: string; at?: number }>): NudgeOutcomes {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const result: NudgeOutcomes = {};
  for (const { userId, step, at } of sent) {
    const entry = (result[step] ??= { sent: 0, done: 0, opened: 0 });
    entry.sent += 1;
    const participant = byId.get(userId);
    if (participant && stepDone(participant, step)) entry.done += 1;
    const lastActive = participant?.lastActiveAt ? Date.parse(participant.lastActiveAt) : NaN;
    if (at !== undefined && lastActive > at) entry.opened += 1;
  }
  return result;
}
