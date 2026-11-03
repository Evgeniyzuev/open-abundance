/**
 * The AI mentors of Open Abundance (docs/mentors/). Each one is a feed system account that tells literary stories in the
 * first person, has a public profile page with an invitation and a chat («Разберу лично твою ситуацию»), and guides
 * people as an AI lead. A new mentor is one entry here, its images in /public/feed/mentors/, a page file that renders
 * components/MentorProfile.tsx, and its capability text in lib/ai/knowledge.ts.
 * Pure and standalone (no imports) so tests, scripts and routes can share it.
 */

type Text = { ru: string; en: string };

export const MENTOR_KEYS = ["alina", "mark"] as const;
export type MentorKey = (typeof MENTOR_KEYS)[number];

export type Mentor = {
  key: MentorKey;
  /** Public profile page. */
  path: string;
  name: Text;
  /** Short form for "Алина печатает…", "Написать Алине". */
  typing: Text;
  writeTo: Text;
  avatarUrl: string;
  coverUrl: string;
  /** feed_system_accounts.account_key of the mentor's stories. */
  systemAccountKey: string;
  seriesKey: string;
  /** AI capability in lib/ai/knowledge.ts and quota bucket in lib/ai/toolGuard.ts. */
  capability: "mentor.alina" | "mentor.mark";
  bucket: "tools.alina" | "tools.mark";
  /** Where the conversation is kept on the device. */
  storageKey: string;
  metaTitle: string;
  metaDescription: string;
  /** Two lines in the mentor's own voice on the profile page. */
  hero: string;
  invite: { title: Text; text: Text; short: Text };
  note: string;
  opening: Text[];
  signInNote: Text;
};

export const MENTORS: Record<MentorKey, Mentor> = {
  alina: {
    key: "alina",
    path: "/alina",
    name: { ru: "Алина Агитова", en: "Alina Agitova" },
    typing: { ru: "Алина печатает…", en: "Alina is typing…" },
    writeTo: { ru: "Написать Алине", en: "Write to Alina" },
    avatarUrl: "/feed/mentors/alina-agitova-avatar.jpg",
    coverUrl: "/feed/mentors/alina-agitova-cover.jpg",
    systemAccountKey: "alina_agitova",
    seriesKey: "alina_stories",
    capability: "mentor.alina",
    bucket: "tools.alina",
    storageKey: "oa.alina.chat.v1",
    metaTitle: "Алина Агитова · ИИ-наставница Open Abundance",
    metaDescription: "Истории о боли и освобождении и личный разбор твоей ситуации: что держит, чего хочется на самом деле и первый лёгкий шаг.",
    hero: "Я знаю, каково это, когда тебя не замечают, недооценивают или обманывают. И знаю, как оттуда выходят на свободу. Пишу об этом истории и помогаю найти свой путь.",
    invite: {
      title: { ru: "Разберу лично твою ситуацию", en: "Let's look at your situation together" },
      text: {
        ru: "Расскажи, где ты сейчас и чего тебе по-настоящему хочется. Я задам пару вопросов, без оценок и спешки. Вместе найдём, что тебя держит, и первый лёгкий шаг, который можно сделать уже сегодня.",
        en: "Tell me where you are now and what you really want. I'll ask a couple of questions, no judgement and no rush. Together we'll find what holds you back and a first easy step you can take today."
      },
      short: {
        ru: "Расскажи, где ты сейчас и чего тебе по-настоящему хочется. Я задам пару вопросов, без оценок и спешки, и вместе найдём первый лёгкий шаг.",
        en: "Tell me where you are now and what you really want. I'll ask a couple of questions, no judgement and no rush, and together we'll find a first easy step."
      }
    },
    note: "Алина — ИИ-наставница Open Abundance. Её истории — литература, собранная из многих настоящих судеб.",
    opening: [
      { ru: "Привет! Я Алина. Рада, что ты заглянул(а) ко мне.", en: "Hi! I'm Alina. I'm glad you stopped by." },
      {
        ru: "Давай без спешки и без оценок. Расскажи, как ты сейчас? Что в твоей жизни сейчас тянет вниз или просто устало?",
        en: "No rush and no judgement. Tell me, how are you right now? What in your life is pulling you down, or just feels tired?"
      }
    ],
    signInNote: {
      ru: "Спасибо, что поделился(ась). Я хочу ответить тебе по-настоящему и не потерять наш разговор. Войди, это займёт минуту, и я сразу продолжу с этого места.",
      en: "Thank you for sharing. I want to answer you properly and not lose our conversation. Sign in, it takes a minute, and I'll continue right from here."
    }
  },
  mark: {
    key: "mark",
    path: "/mark",
    name: { ru: "Марк Соколов", en: "Mark Sokolov" },
    typing: { ru: "Марк печатает…", en: "Mark is typing…" },
    writeTo: { ru: "Написать Марку", en: "Write to Mark" },
    avatarUrl: "/feed/mentors/mark-sokolov-avatar.jpg",
    coverUrl: "/feed/mentors/mark-sokolov-cover.jpg",
    systemAccountKey: "mark_sokolov",
    seriesKey: "mark_stories",
    capability: "mentor.mark",
    bucket: "tools.mark",
    storageKey: "oa.mark.chat.v1",
    metaTitle: "Марк Соколов · ИИ-наставник Open Abundance",
    metaDescription: "Истории о том, как выбраться из одиночки к своим людям, и личный разбор: где ты застрял, чего хочешь и с кем сделать первый шаг.",
    hero: "Я знаю, каково это: вокруг полно людей, а позвонить некому. Я выбрался оттуда не в одиночку. Пишу об этом истории и помогаю найти своих.",
    invite: {
      title: { ru: "Разберём, где ты застрял", en: "Let's see where you got stuck" },
      text: {
        ru: "Расскажи, что сейчас не так и чего тебе на самом деле хочется. Я спрошу пару вещей, без нотаций. Вместе найдём первый шаг на сегодня и человека, с которым его не страшно сделать.",
        en: "Tell me what's not right now and what you actually want. I'll ask a couple of things, no lectures. Together we'll find a first step for today and someone to take it with."
      },
      short: {
        ru: "Расскажи, что сейчас не так и чего тебе на самом деле хочется. Я спрошу пару вещей, без нотаций, и найдём первый шаг и человека, с которым его сделать.",
        en: "Tell me what's not right and what you actually want. I'll ask a couple of things, no lectures, and we'll find a first step and someone to take it with."
      }
    },
    note: "Марк — ИИ-наставник Open Abundance. Его истории — литература, собранная из многих настоящих судеб.",
    opening: [
      { ru: "Привет, я Марк. Хорошо, что зашёл(ла).", en: "Hey, I'm Mark. Good that you came by." },
      {
        ru: "Можно без красивых слов. Как ты сейчас на самом деле? Что последнее время держит тебя на месте?",
        en: "No need for nice words. How are you really doing right now? What has been keeping you stuck lately?"
      }
    ],
    signInNote: {
      ru: "Понял тебя. Хочу ответить нормально и не потерять наш разговор. Войди, это минута, и я продолжу с этого места.",
      en: "Got it. I want to answer properly and not lose our conversation. Sign in, it takes a minute, and I'll pick up right here."
    }
  }
};

export function isMentorKey(value: unknown): value is MentorKey {
  return typeof value === "string" && (MENTOR_KEYS as readonly string[]).includes(value);
}

export function mentorBySystemAccount(accountKey: string | null | undefined): Mentor | null {
  return MENTOR_KEYS.map((key) => MENTORS[key]).find((mentor) => mentor.systemAccountKey === accountKey) ?? null;
}

export function mentorByPath(path: string | null | undefined): Mentor | null {
  return MENTOR_KEYS.map((key) => MENTORS[key]).find((mentor) => mentor.path === path) ?? null;
}
