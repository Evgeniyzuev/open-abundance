/**
 * Catalog for the "Choose a direction" challenge. Each niche offers the
 * simplest, most commonly requested practical tasks so a participant who is
 * unsure what to offer can pick a first, concrete step. Keys are stable,
 * ASCII-only identifiers that are also stored as challenge proof data.
 */
export type NicheTask = {
  key: string;
  title: { en: string; ru: string };
  firstStep: { en: string; ru: string };
};

export type Niche = {
  key: string;
  title: { en: string; ru: string };
  tasks: NicheTask[];
};

export const NICHES: Niche[] = [
  {
    key: "writing",
    title: { en: "Texts and content", ru: "Тексты и контент" },
    tasks: [
      {
        key: "writing_post_editing",
        title: { en: "Edit and polish short posts", ru: "Редактура коротких постов" },
        firstStep: { en: "Take one of your own old posts and improve it. Keep before and after.", ru: "Возьмите свой старый пост и улучшите его. Сохраните «до» и «после»." }
      },
      {
        key: "writing_product_description",
        title: { en: "Product or service descriptions", ru: "Описания товаров и услуг" },
        firstStep: { en: "Write a 3-sentence description for something you know well.", ru: "Напишите описание из трёх предложений для того, что хорошо знаете." }
      }
    ]
  },
  {
    key: "design",
    title: { en: "Visuals and simple design", ru: "Визуал и простой дизайн" },
    tasks: [
      {
        key: "design_cover_images",
        title: { en: "Covers and thumbnails for posts and videos", ru: "Обложки для постов и видео" },
        firstStep: { en: "Make one cover for a topic you like and compare it with two examples.", ru: "Сделайте одну обложку на любимую тему и сравните с двумя примерами." }
      },
      {
        key: "design_presentation_cleanup",
        title: { en: "Tidy up presentations", ru: "Приведение презентаций в порядок" },
        firstStep: { en: "Fix fonts and spacing in one real slide deck.", ru: "Выровняйте шрифты и отступы в одной реальной презентации." }
      }
    ]
  },
  {
    key: "ai_helper",
    title: { en: "AI helper for routine work", ru: "ИИ-помощник для рутины" },
    tasks: [
      {
        key: "ai_template_for_routine",
        title: { en: "Turn a repeated task into a reusable AI prompt", ru: "Превратить повторяющуюся задачу в шаблон для ИИ" },
        firstStep: { en: "Pick one task you do weekly and write the input, the output and a prompt that works.", ru: "Возьмите задачу, которую делаете каждую неделю, опишите вход, результат и рабочий запрос к ИИ." }
      },
      {
        key: "ai_research_summary",
        title: { en: "Short research summaries on a topic", ru: "Краткие обзоры по теме" },
        firstStep: { en: "Summarize a topic in one page with sources and a clear next step.", ru: "Сделайте обзор темы на одну страницу с источниками и понятным следующим шагом." }
      }
    ]
  },
  {
    key: "tutoring",
    title: { en: "Teaching and tutoring", ru: "Обучение и репетиторство" },
    tasks: [
      {
        key: "tutoring_first_lesson",
        title: { en: "One short lesson on a skill you know", ru: "Один короткий урок по навыку, который вы знаете" },
        firstStep: { en: "Write a 15-minute lesson plan and one practice exercise.", ru: "Составьте план урока на 15 минут и одно практическое упражнение." }
      },
      {
        key: "tutoring_language_practice",
        title: { en: "Conversation practice", ru: "Разговорная практика" },
        firstStep: { en: "Prepare 10 questions for a 20-minute conversation.", ru: "Подготовьте 10 вопросов для 20-минутного разговора." }
      }
    ]
  },
  {
    key: "local_help",
    title: { en: "Local and personal help", ru: "Помощь рядом и личные услуги" },
    tasks: [
      {
        key: "local_errands",
        title: { en: "Errands and small tasks nearby", ru: "Мелкие поручения рядом" },
        firstStep: { en: "List three tasks you can do reliably and when you are available.", ru: "Перечислите три задачи, которые можете выполнять надёжно, и когда вы свободны." }
      },
      {
        key: "local_tech_setup",
        title: { en: "Set up phones, accounts and apps for others", ru: "Настройка телефонов и приложений для других" },
        firstStep: { en: "Write a checklist for one setup you already did for a friend.", ru: "Запишите чек-лист по настройке, которую вы уже делали для знакомого." }
      }
    ]
  },
  {
    key: "digital_products",
    title: { en: "Templates and digital products", ru: "Шаблоны и цифровые продукты" },
    tasks: [
      {
        key: "digital_checklist",
        title: { en: "A practical checklist or template", ru: "Практичный чек-лист или шаблон" },
        firstStep: { en: "Turn something you know into a one-page checklist.", ru: "Превратите то, что вы знаете, в чек-лист на одной странице." }
      },
      {
        key: "digital_spreadsheet",
        title: { en: "A ready-to-use spreadsheet", ru: "Готовая таблица для учёта" },
        firstStep: { en: "Build a spreadsheet for budgeting or planning and test it on yourself.", ru: "Сделайте таблицу для бюджета или планов и проверьте её на себе." }
      }
    ]
  }
];

const NICHE_TASK_KEYS = new Set(NICHES.flatMap((niche) => niche.tasks.map((task) => task.key)));

export function isNicheTaskKey(value: unknown): value is string {
  return typeof value === "string" && NICHE_TASK_KEYS.has(value);
}

export function nicheKeyForTask(taskKey: string): string | null {
  return NICHES.find((niche) => niche.tasks.some((task) => task.key === taskKey))?.key ?? null;
}
