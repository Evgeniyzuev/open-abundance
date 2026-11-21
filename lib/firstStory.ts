// The story entry «Один свободный день» (docs/FIRST_STORY_SCRIPT.md): seven short scenes, each choice adds hidden tags,
// Nova reflects the strongest motive and the main obstacle as a wish. Pure functions and texts only, no imports, so the
// node contract test (scripts/verify-first-story-contract.mjs) runs it directly.

export type StoryMotive = "money" | "time" | "meaning" | "people" | "health" | "create";
export type StoryHorizon = "now" | "year" | "dream";
export type StoryObstacle = "no_time" | "fear" | "skills" | "no_money" | "alone";
export type StoryStyle = "solo" | "together";
export type StoryTag = StoryMotive | StoryHorizon | StoryObstacle | StoryStyle | "watch";

type Text = { ru: string; en: string };
export type StoryChoice = { key: string; text: Text; tags: StoryTag[] };
export type StoryScene = { key: string; title: Text; text: Text; choices: StoryChoice[] };

export const STORY_MOTIVES: readonly StoryMotive[] = ["money", "time", "meaning", "people", "health", "create"];
const OBSTACLES: readonly StoryObstacle[] = ["no_time", "fear", "skills", "no_money", "alone"];
const HORIZONS: readonly StoryHorizon[] = ["now", "year", "dream"];

/** The character looks offered before the first scene (simple own signs, not taken from any game). */
export const STORY_LOOKS = ["🧑", "👩", "👨", "🧑‍🦱", "👩‍🦰", "🧔"] as const;

/** What appears in the character's world for a motive (the "desired life" picture). */
export const WORLD_ITEMS: Record<StoryMotive | "together", { icon: string; text: Text }> = {
  money: { icon: "🏡", text: { ru: "Спокойный дом без счетов на столе", en: "A calm home, no bills on the table" } },
  time: { icon: "💻", text: { ru: "Ноутбук у окна и утро без будильника", en: "A laptop by the window, mornings without an alarm" } },
  create: { icon: "🛠️", text: { ru: "Мастерская со своим делом", en: "A workshop with your own thing" } },
  meaning: { icon: "🤝", text: { ru: "Люди, которым ты помогаешь", en: "People you help" } },
  people: { icon: "🍽️", text: { ru: "Друзья за общим столом", en: "Friends around one table" } },
  health: { icon: "🌅", text: { ru: "Утреннее солнце и силы", en: "Morning sun and energy" } },
  together: { icon: "🧭", text: { ru: "Рядом напарник с похожей целью", en: "A partner with a similar goal" } }
};

const scene = (key: string, title: Text, text: Text, choices: StoryChoice[]): StoryScene => ({ key, title, text, choices });
const c = (key: string, ru: string, en: string, tags: StoryTag[]): StoryChoice => ({ key, text: { ru, en }, tags });

export const STORY_SCENES: Record<string, StoryScene> = {
  morning: scene("morning", { ru: "Утро", en: "Morning" }, { ru: "Будильник не звонит. Сегодня у тебя целый свободный день. Первая мысль?", en: "No alarm. You have a whole free day today. First thought?" }, [
    c("rest", "Наконец-то высплюсь и ничего не буду делать", "Finally sleep in and do nothing", ["health", "time"]),
    c("own", "Займусь тем, на что вечно нет времени", "Do the thing I never have time for", ["create", "no_time"]),
    c("friends", "Позвоню друзьям, давно не виделись", "Call friends, it's been a while", ["people", "together"])
  ]),
  money: scene("money", { ru: "Неожиданные деньги", en: "Unexpected money" }, { ru: "На карту пришло 300 долларов, которых ты не ждал. Куда они уйдут?", en: "300 dollars you didn't expect land on your card. Where do they go?" }, [
    c("save", "Отложу. Хочу спокойствия", "Save them. I want peace of mind", ["money", "now"]),
    c("tool", "Потрачу на курс или инструмент для своего дела", "A course or a tool for my own thing", ["create", "year"]),
    c("experience", "Куплю впечатление: поездку, концерт", "An experience: a trip, a concert", ["meaning", "now"])
  ]),
  offers: scene("offers", { ru: "Два предложения", en: "Two offers" }, { ru: "Тебе предлагают две работы. Первая платит вдвое больше. Вторая три дня в неделю и из любой точки мира.", en: "Two jobs are offered. One pays twice as much. The other is three days a week from anywhere." }, [
    c("double", "Беру вдвое больше", "Twice the money", ["money"]),
    c("freedom", "Беру свободу", "Freedom", ["time"]),
    c("mine", "Хочу своё, а не работу", "I want my own thing, not a job", ["create", "dream"])
  ]),
  friend: scene("friend", { ru: "Друг с идеей", en: "A friend with an idea" }, { ru: "Друг зовёт в проект, который может что-то изменить в вашем городе. Денег пока нет.", en: "A friend invites you into a project that could change something in your town. No money yet." }, [
    c("in", "Я в деле", "I'm in", ["meaning", "together"]),
    c("advice", "Помогу советом, но не больше", "I'll help with advice, no more", ["solo"]),
    c("scared", "Интересно, но страшно ошибиться", "Interesting, but I'm afraid to get it wrong", ["fear"])
  ]),
  evening: scene("evening", { ru: "Вечер", en: "Evening" }, { ru: "День почти прошёл. Что тебя больше всего порадовало бы, если оглянуться?", en: "The day is almost over. Looking back, what would make you happiest?" }, [
    c("made", "Что-то сделал своими руками", "I made something myself", ["create"]),
    c("closer", "Стал на шаг ближе к деньгам на важное", "One step closer to money for what matters", ["money", "year"]),
    c("close", "Провёл время с близкими людьми", "Time with people close to me", ["people"]),
    c("energy", "Чувствую силы, а не усталость", "I feel energy, not tiredness", ["health"])
  ]),
  honest: scene("honest", { ru: "Честно", en: "Honestly" }, { ru: "Ты давно хотел что-то изменить. Что обычно останавливает?", en: "You've wanted to change something for a while. What usually stops you?" }, [
    c("time", "Не хватает времени", "No time", ["no_time"]),
    c("start", "Не знаю, с чего начать", "I don't know where to start", ["fear"]),
    c("skills", "Не умею того, что нужно", "I lack the skills", ["skills"]),
    c("money", "Нет денег на старт", "No money to start", ["no_money"]),
    c("alone", "Не с кем, одному тяжело", "No one to do it with", ["alone"])
  ]),
  button: scene("button", { ru: "Волшебная кнопка", en: "The magic button" }, { ru: "Представь кнопку, которая через год даёт одно. Что выберешь?", en: "Imagine a button that gives you one thing a year from now. What do you pick?" }, [
    c("income", "Доход, который не зависит от начальника", "Income that doesn't depend on a boss", ["money", "time", "year"]),
    c("proud", "Дело, которым горжусь", "Work I'm proud of", ["create", "meaning", "dream"]),
    c("people", "Своих людей рядом", "My people around me", ["people", "together"]),
    c("health", "Здоровье и энергию", "Health and energy", ["health"])
  ]),
  helper: scene("helper", { ru: "Помощник", en: "The helper" }, { ru: "Появляется Нова: «Я ИИ. Могу помочь с этим, по шагу в день. Как тебе удобнее?»", en: "Nova appears: \"I'm an AI. I can help with this, one step a day. How would you like it?\"" }, [
    c("solo", "Один маленький шаг в день, сам", "One small step a day, on my own", ["solo"]),
    c("together", "Шаг в день и люди с похожей целью рядом", "A step a day with people who share the goal", ["together"]),
    c("watch", "Сначала посмотреть, как это у других", "First see how it works for others", ["watch"])
  ])
};

export type StoryState = { look?: string; answers: Array<{ scene: string; choice: string }> };

export function storyTags(state: StoryState): StoryTag[] {
  const tags: StoryTag[] = [];
  for (const answer of state.answers) {
    const choice = STORY_SCENES[answer.scene]?.choices.find((item) => item.key === answer.choice);
    if (choice) tags.push(...choice.tags);
  }
  return tags;
}

function count<T extends StoryTag>(tags: StoryTag[], keys: readonly T[]): Array<{ key: T; weight: number; last: number }> {
  return keys
    .map((key) => ({ key, weight: tags.filter((tag) => tag === key).length, last: tags.lastIndexOf(key) }))
    .filter((item) => item.weight > 0)
    // Ties go to the tag chosen later in the story (closer to "what I'd press now"), then to list order.
    .sort((a, b) => b.weight - a.weight || b.last - a.last);
}

/** The next scene key, or null when the story is over. Scene 3 branches on scenes 1–2. */
export function nextSceneKey(state: StoryState): string | null {
  const done = state.answers.map((answer) => answer.scene);
  const order = ["morning", "money", "branch", "evening", "honest", "button", "helper"];
  for (const key of order) {
    if (key === "branch") {
      if (done.includes("offers") || done.includes("friend")) continue;
      const tags = storyTags(state);
      const practical = tags.filter((tag) => tag === "money" || tag === "time").length;
      const social = tags.filter((tag) => tag === "people" || tag === "meaning" || tag === "create").length;
      return practical >= social ? "offers" : "friend";
    }
    if (!done.includes(key)) return key;
  }
  return null;
}

export function storySceneCount(): number {
  return 7;
}

const REFLECTION: Record<StoryMotive, { reflect: Text; wish: Text }> = {
  time: { reflect: { ru: "Похоже, тебе важнее свобода времени, чем большие деньги", en: "Looks like freedom of time matters more to you than big money" }, wish: { ru: "Работать на себя хотя бы пару дней в неделю", en: "Work for myself at least a couple of days a week" } },
  money: { reflect: { ru: "Похоже, тебе важно спокойствие за деньги", en: "Looks like peace of mind about money matters to you" }, wish: { ru: "Подушка в три месячных расхода", en: "A cushion of three months of expenses" } },
  create: { reflect: { ru: "Похоже, тебе хочется делать своё", en: "Looks like you want to make your own thing" }, wish: { ru: "Первый заказ или продажа своего дела", en: "The first order or sale of my own thing" } },
  meaning: { reflect: { ru: "Похоже, тебе важно, чтобы дело что-то меняло", en: "Looks like you want your work to change something" }, wish: { ru: "Проект, который помогает людям рядом", en: "A project that helps people nearby" } },
  people: { reflect: { ru: "Похоже, тебе важны свои люди рядом", en: "Looks like having your people around matters to you" }, wish: { ru: "Круг из нескольких близких по духу людей", en: "A circle of a few like-minded people" } },
  health: { reflect: { ru: "Похоже, сейчас главное силы и энергия", en: "Looks like energy matters most right now" }, wish: { ru: "Ритм, в котором есть силы на всё важное", en: "A rhythm with energy for everything that matters" } }
};

const OBSTACLE_TEXT: Record<StoryObstacle, Text> = {
  fear: { ru: "а мешает чаще всего страх начать", en: "and what stops you most is the fear of starting" },
  no_time: { ru: "а мешает чаще всего нехватка времени", en: "and what stops you most is lack of time" },
  skills: { ru: "а мешает чаще всего то, что не хватает навыков", en: "and what stops you most is missing skills" },
  no_money: { ru: "а мешают чаще всего деньги на старт", en: "and what stops you most is money to start" },
  alone: { ru: "а мешает чаще всего то, что одному тяжело", en: "and what stops you most is doing it alone" }
};

const FIRST_STEP: Record<StoryObstacle, Text> = {
  fear: { ru: "Записать самый маленький шаг, который не страшно сделать сегодня", en: "Write down the smallest step that isn't scary to take today" },
  no_time: { ru: "Найти 15 минут в завтрашнем дне и отметить их", en: "Find 15 minutes in tomorrow and mark them" },
  skills: { ru: "Выбрать один навык, Нова подберёт урок на 10 минут", en: "Pick one skill, Nova finds a 10-minute lesson" },
  no_money: { ru: "Нова найдёт один способ начать без денег", en: "Nova finds one way to start without money" },
  alone: { ru: "Отметить «ищу напарника», Нова поищет человека с похожей целью", en: "Mark \"looking for a partner\", Nova looks for someone with a similar goal" }
};

export type StoryResolution = {
  motive: StoryMotive;
  second: StoryMotive | null;
  obstacle: StoryObstacle;
  horizon: StoryHorizon;
  style: StoryStyle;
  watch: boolean;
  sentence: string;
  wish: string;
  alternatives: string[];
  firstStep: string;
  world: Array<{ icon: string; text: string }>;
};

const pick = (text: Text, locale: string) => (locale === "ru" ? text.ru : text.en);

export function resolveStory(state: StoryState, locale: string): StoryResolution {
  const tags = storyTags(state);
  const motives = count(tags, STORY_MOTIVES);
  const motive = motives[0]?.key ?? "time";
  const second = motives.find((item) => item.key !== motive)?.key ?? null;
  const obstacle = count(tags, OBSTACLES)[0]?.key ?? "fear";
  const horizon = count(tags, HORIZONS)[0]?.key ?? "year";
  const style: StoryStyle = tags.lastIndexOf("together") > tags.lastIndexOf("solo") ? "together" : "solo";
  const wish = pick(REFLECTION[motive].wish, locale);
  const sentence = `${pick(REFLECTION[motive].reflect, locale)}, ${pick(OBSTACLE_TEXT[obstacle], locale)}.`;
  // "Almost": the neighbouring wishes, the second motive first, then the next strongest ones.
  const alternatives = [second, ...motives.map((item) => item.key), ...STORY_MOTIVES]
    .filter((key): key is StoryMotive => Boolean(key) && key !== motive)
    .filter((key, index, list) => list.indexOf(key) === index)
    .slice(0, 3)
    .map((key) => pick(REFLECTION[key].wish, locale));
  const worldKeys: Array<StoryMotive | "together"> = motives.slice(0, 3).map((item) => item.key);
  if (style === "together") worldKeys.push("together");
  return {
    motive,
    second,
    obstacle,
    horizon,
    style,
    watch: tags.includes("watch"),
    sentence,
    wish,
    alternatives,
    firstStep: pick(FIRST_STEP[obstacle], locale),
    world: worldKeys.map((key) => ({ icon: WORLD_ITEMS[key].icon, text: pick(WORLD_ITEMS[key].text, locale) }))
  };
}

/** The growth-path motive saved for the first quest (lib/questPath.ts QUEST_MOTIVES). */
export function questMotiveFor(motive: StoryMotive): "income" | "path" | "change" {
  if (motive === "money" || motive === "time") return "income";
  if (motive === "create") return "path";
  return "change";
}

export function storyText(text: Text, locale: string): string {
  return pick(text, locale);
}

export const STORY_UI: Record<string, Text> = {
  lookTitle: { ru: "Это ты в истории. Выбери, как выглядишь", en: "This is you in the story. Pick a look" },
  scene: { ru: "Сцена {n} из {total}", en: "Scene {n} of {total}" },
  skip: { ru: "Пропустить", en: "Skip" },
  novaSays: { ru: "Нова", en: "Nova" },
  wishQuestion: { ru: "Вижу такое желание: «{wish}». Так?", en: "I see this wish: \"{wish}\". Right?" },
  yes: { ru: "Да", en: "Yes" },
  almost: { ru: "Почти", en: "Almost" },
  other: { ru: "Нет, другое", en: "No, something else" },
  otherPlaceholder: { ru: "Чего ты хочешь? Пара слов", en: "What do you want? A few words" },
  save: { ru: "Это моё желание", en: "That's my wish" },
  worldTitle: { ru: "Вот жизнь, к которой мы идём", en: "Here's the life we're heading to" },
  firstStep: { ru: "Первый шаг на 2 минуты", en: "First step, 2 minutes" },
  continue: { ru: "Сохранить и начать", en: "Save and start" },
  tomorrow: { ru: "Завтра откроется следующий шаг", en: "Tomorrow the next step opens" }
};

export function storyUi(key: keyof typeof STORY_UI, locale: string, values: Record<string, string | number> = {}): string {
  let text = pick(STORY_UI[key], locale);
  for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, String(value));
  return text;
}

const STORY_FLAG_KEY = "oa.storyEntry";
const STORY_RESULT_KEY = "oa.storyResult";

/** The story replaces the first guest quest only where turned on: /?story=1 (QA and the founder) for now. */
export function storyEntryEnabled(search: string, read: (key: string) => string | null, write: (key: string, value: string) => void): boolean {
  const flag = new URLSearchParams(search).get("story");
  if (flag === "1" || flag === "0") write(STORY_FLAG_KEY, flag);
  return (flag ?? read(STORY_FLAG_KEY)) === "1";
}

export const STORY_STORAGE = { flag: STORY_FLAG_KEY, result: STORY_RESULT_KEY } as const;
