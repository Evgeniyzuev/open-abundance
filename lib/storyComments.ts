// Live comments under stories, honestly: Nova (marked as AI) asks one question under a story that invites people
// to tell their own experience, and the quest "Tell how it was for you" pays when three other people mark such a
// comment as useful (▲). No project imports, so node tests it directly.

export const USEFUL_STORY_COMMENT_LOGIC = "story_comment_useful";
export const USEFUL_STORY_COMMENT_MIN_LENGTH = 60;
export const USEFUL_STORY_COMMENT_MIN_VOTES = 3;

type Lang = "ru" | "en";

/** Questions for the editorial and system stories, by source key. Other posts get the general question. */
const STORY_QUESTIONS: Record<string, Record<Lang, string>> = {
  "editorial_story:front-row": { ru: "А у тебя было так, что работа съедала вечера с близкими? Что помогло вернуть время?", en: "Has work ever eaten your evenings with the people you love? What helped you get that time back?" },
  "editorial_story:first-order": { ru: "Помнишь свою первую продажу или первый заработок не от работодателя? Как это было?", en: "Do you remember your first sale, or the first money not from an employer? How did it feel?" },
  "editorial_story:sea-for-mom": { ru: "Какое желание ты хотел(а) бы исполнить для близкого человека?", en: "Which wish would you like to make come true for someone close to you?" },
  "editorial_story:our-own-key": { ru: "Что для тебя значит «своё жильё»? Ты уже на пути к нему или пока откладываешь?", en: "What does a home of your own mean to you? Are you on the way, or still putting it off?" },
  "editorial_story:drawing-again": { ru: "Есть ли у тебя дело, которое ты прячешь или откладываешь «на потом»?", en: "Is there something you love doing that you hide or keep for later?" },
  "editorial_story:what-is-easy": { ru: "А что тебе даётся легко, хотя другим это кажется сложным?", en: "What comes easily to you, even though others find it hard?" },
  "editorial_story:first-listing": { ru: "Было сложно назвать цену за свою работу? Как ты решаешь, сколько просить?", en: "Was it hard to name a price for your work? How do you decide how much to ask?" },
  "editorial_story:one-dollar-a-day": { ru: "С какой маленькой суммы ты начал(а) бы откладывать, чтобы точно не бросить?", en: "What small daily amount would you start saving with, so that you surely keep going?" },
  "editorial_story:three-steps-to-move": { ru: "Какое большое дело ты давно откладываешь? На какие три шага его можно разбить?", en: "Which big thing have you been putting off? What three steps could it break into?" },
  "editorial_story:route-by-steps": { ru: "О какой поездке ты мечтаешь? Что мешает начать к ней готовиться?", en: "Which trip do you dream about? What stops you from starting to prepare?" },
  "editorial_story:first-thousand-lesson": { ru: "Когда ты впервые понял(а), как работают проценты: на кредите или на накоплениях?", en: "When did you first understand how interest works: on a loan or on savings?" },
  "editorial_story:coming-back": { ru: "Бывало, что ты бросал(а) начатое? Что помогло вернуться?", en: "Have you ever dropped something you started? What helped you come back?" },
  "editorial_story:neighbour-and-phone": { ru: "Чем ты мог(ла) бы помочь другому человеку уже сегодня, даже если кажется, что это мелочь?", en: "How could you help someone today, even if it seems like a small thing?" },
  "system_story:01-housing-and-productivity": { ru: "Сколько лет тебе нужно, чтобы накопить на жильё, если считать честно?", en: "Counting honestly, how many years would it take you to save for a home?" },
  "system_story:02-access-scarcity": { ru: "От чего тебе приходится отказываться каждый месяц, хотя это есть в магазинах?", en: "What do you give up every month, even though it is right there in the shops?" },
  "system_story:03-money-flows": { ru: "Какая обязательная трата съедает больше всего твоей зарплаты?", en: "Which fixed cost eats the biggest part of your income?" },
  "system_story:04-ai-and-work": { ru: "Чего ты ждёшь от ИИ в своей работе: облегчения или угрозы?", en: "What do you expect from AI in your work: relief or a threat?" },
  "system_story:05-power-and-appeal": { ru: "Было ли так, что одно чужое решение сильно изменило твою жизнь? Что ты тогда сделал(а)?", en: "Has one decision by someone else ever changed your life a lot? What did you do then?" },
  "system_story:06-coordination-gap": { ru: "Какой полезный совет ты сохранил(а), но так и не применил(а)? Почему?", en: "Which useful advice did you save but never use? Why?" },
  "system_story:07-connected-path": { ru: "Сколько приложений ты используешь, чтобы двигаться к цели? Какого не хватает?", en: "How many apps do you use to move toward your goal? Which one is missing?" },
  "system_story:08-portable-contribution": { ru: "Приходилось доказывать себя с нуля на новом месте? Что помогло?", en: "Have you had to prove yourself from scratch in a new place? What helped?" },
  "system_story:09-transparent-algorithms": { ru: "Было ли решение алгоритма, которое ты так и не понял(а)?", en: "Was there an algorithm's decision about you that you never understood?" },
  "system_story:10-first-personal-step": { ru: "Какое желание у тебя давно в списке «когда-нибудь»? Какой первый шаг можно сделать на этой неделе?", en: "Which wish has long been on your someday list? What first step could you take this week?" },
  "system_story:11-positive-sum": { ru: "Чей успех помог и тебе?", en: "Whose success has helped you too?" },
  "system_story:12-test-before-belief": { ru: "Что должно случиться, чтобы ты поверил(а), что это работает?", en: "What would have to happen for you to believe this works?" }
};

const GENERAL_QUESTION: Record<Lang, string> = {
  ru: "А у тебя было похожее? Расскажи в двух-трёх предложениях: твой опыт может помочь кому-то ещё.",
  en: "Have you had something similar? Tell it in two or three sentences: your experience may help someone else."
};

/** Nova's question under a post, in Russian or English (the other languages read the English one). */
export function storyQuestion(sourceKey: string | null | undefined, locale: string): string {
  const lang: Lang = locale === "ru" ? "ru" : "en";
  const key = sourceKey?.trim().toLowerCase() ?? "";
  return STORY_QUESTIONS[key]?.[lang] ?? GENERAL_QUESTION[lang];
}

export type StoryCommentRow = { id: string; post_id: string; user_id: string; body: string; parent_comment_id: string | null; deleted_at: string | null };
export type StoryCommentVote = { comment_id: string; user_id: string; value: number };

/**
 * The person's first comment that counts for the quest: their own story under someone else's post (not a reply,
 * at least 60 characters), with at least three ▲ from other people.
 */
export function findUsefulStoryComment(
  userId: string,
  comments: StoryCommentRow[],
  votes: StoryCommentVote[],
  postAuthors: Map<string, string | null>
): StoryCommentRow | null {
  for (const comment of comments) {
    if (comment.user_id !== userId || comment.deleted_at || comment.parent_comment_id) continue;
    if (comment.body.trim().length < USEFUL_STORY_COMMENT_MIN_LENGTH) continue;
    if (postAuthors.get(comment.post_id) === userId) continue;
    const voters = new Set(votes.filter((vote) => vote.comment_id === comment.id && vote.value > 0 && vote.user_id !== userId).map((vote) => vote.user_id));
    if (voters.size >= USEFUL_STORY_COMMENT_MIN_VOTES) return comment;
  }
  return null;
}
