export type FirstWishOption = {
  key: string;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
  targetAmount: number;
  difficultyLevel: number;
};

export type FirstWishCategory = {
  key: string;
  emoji: string;
  title: { ru: string; en: string };
  options: FirstWishOption[];
};

export const FIRST_WISH_DAILY_ADDITIONS = 1;

export const FIRST_WISH_CATEGORIES: FirstWishCategory[] = [
  {
    key: "earn",
    emoji: "💰",
    title: { ru: "Заработать больше", en: "Earn more" },
    options: [
      {
        key: "earn.income_x2",
        title: { ru: "Удвоить доход", en: "Double my income" },
        description: { ru: "Выйти на новый уровень дохода в течение года", en: "Reach a new income level within a year" },
        targetAmount: 5000,
        difficultyLevel: 3
      },
      {
        key: "earn.side_income",
        title: { ru: "Первый побочный доход", en: "First side income" },
        description: { ru: "Получить первые деньги вне основной работы", en: "Earn the first money outside the main job" },
        targetAmount: 500,
        difficultyLevel: 2
      },
      {
        key: "earn.passive",
        title: { ru: "Пассивный доход", en: "Passive income" },
        description: { ru: "Создать источник дохода, который работает без меня", en: "Build an income source that works without me" },
        targetAmount: 10000,
        difficultyLevel: 4
      },
      {
        key: "earn.first_clients",
        title: { ru: "Первые клиенты", en: "First clients" },
        description: { ru: "Найти трёх платящих клиентов для своей услуги", en: "Find three paying clients for my service" },
        targetAmount: 1000,
        difficultyLevel: 2
      },
      {
        key: "earn.salary_raise",
        title: { ru: "Повышение на работе", en: "A raise at work" },
        description: { ru: "Дорасти до повышения зарплаты или позиции", en: "Grow into a salary or position raise" },
        targetAmount: 2000,
        difficultyLevel: 2
      }
    ]
  },
  {
    key: "create",
    emoji: "🛠",
    title: { ru: "Создать что-то", en: "Create something" },
    options: [
      {
        key: "create.project",
        title: { ru: "Свой проект", en: "My own project" },
        description: { ru: "Запустить первую рабочую версию своего проекта", en: "Launch the first working version of my project" },
        targetAmount: 3000,
        difficultyLevel: 3
      },
      {
        key: "create.product",
        title: { ru: "Первый продукт", en: "First product" },
        description: { ru: "Создать продукт, который готовы купить", en: "Create a product people are ready to buy" },
        targetAmount: 2000,
        difficultyLevel: 3
      },
      {
        key: "create.content",
        title: { ru: "Свой канал", en: "My own channel" },
        description: { ru: "Вести канал и собрать первую аудиторию", en: "Run a channel and gather a first audience" },
        targetAmount: 500,
        difficultyLevel: 1
      },
      {
        key: "create.website",
        title: { ru: "Сайт или приложение", en: "Website or app" },
        description: { ru: "Опубликовать свой сайт или простое приложение", en: "Publish my website or a simple app" },
        targetAmount: 1000,
        difficultyLevel: 2
      },
      {
        key: "create.business",
        title: { ru: "Малый бизнес", en: "Small business" },
        description: { ru: "Выйти на стабильные продажи в своём деле", en: "Reach stable sales in my own business" },
        targetAmount: 15000,
        difficultyLevel: 5
      }
    ]
  },
  {
    key: "learn",
    emoji: "🎓",
    title: { ru: "Научиться навыку", en: "Learn a skill" },
    options: [
      {
        key: "learn.english",
        title: { ru: "Английский язык", en: "English language" },
        description: { ru: "Свободно говорить и работать на английском", en: "Speak and work fluently in English" },
        targetAmount: 800,
        difficultyLevel: 2
      },
      {
        key: "learn.programming",
        title: { ru: "Программирование", en: "Programming" },
        description: { ru: "Освоить профессию и собрать первые проекты", en: "Learn the craft and build first projects" },
        targetAmount: 2000,
        difficultyLevel: 3
      },
      {
        key: "learn.design",
        title: { ru: "Дизайн", en: "Design" },
        description: { ru: "Делать работы, за которые платят", en: "Create work people pay for" },
        targetAmount: 1200,
        difficultyLevel: 2
      },
      {
        key: "learn.public_speaking",
        title: { ru: "Публичные выступления", en: "Public speaking" },
        description: { ru: "Уверенно выступать перед аудиторией", en: "Speak confidently in front of an audience" },
        targetAmount: 600,
        difficultyLevel: 1
      },
      {
        key: "learn.investing",
        title: { ru: "Инвестиции", en: "Investing" },
        description: { ru: "Разобраться в инвестициях и собрать первый портфель", en: "Understand investing and build a first portfolio" },
        targetAmount: 3000,
        difficultyLevel: 2
      }
    ]
  },
  {
    key: "life",
    emoji: "🏠",
    title: { ru: "Улучшить жизнь", en: "Improve my life" },
    options: [
      {
        key: "life.home",
        title: { ru: "Уютное жильё", en: "A cozy home" },
        description: { ru: "Обновить пространство, где живёшь", en: "Refresh the space where I live" },
        targetAmount: 5000,
        difficultyLevel: 3
      },
      {
        key: "life.travel",
        title: { ru: "Путешествие мечты", en: "Dream trip" },
        description: { ru: "Съездить в место, которое давно хочется увидеть", en: "Visit the place I have long wanted to see" },
        targetAmount: 3000,
        difficultyLevel: 2
      },
      {
        key: "life.health",
        title: { ru: "Здоровье и форма", en: "Health and fitness" },
        description: { ru: "Прийти в форму и держать ритм", en: "Get in shape and keep the rhythm" },
        targetAmount: 500,
        difficultyLevel: 1
      },
      {
        key: "life.car",
        title: { ru: "Автомобиль", en: "A car" },
        description: { ru: "Купить свой автомобиль", en: "Buy my own car" },
        targetAmount: 15000,
        difficultyLevel: 4
      },
      {
        key: "life.safety",
        title: { ru: "Финансовая подушка", en: "Financial cushion" },
        description: { ru: "Накопить резерв на несколько месяцев жизни", en: "Save a reserve for several months of living" },
        targetAmount: 10000,
        difficultyLevel: 3
      }
    ]
  },
  {
    key: "people",
    emoji: "🤝",
    title: { ru: "Найти людей", en: "Find people" },
    options: [
      {
        key: "people.team",
        title: { ru: "Команда для проекта", en: "A team for my project" },
        description: { ru: "Собрать людей, с которыми делаем общее дело", en: "Gather people to build something together" },
        targetAmount: 1000,
        difficultyLevel: 2
      },
      {
        key: "people.mentor",
        title: { ru: "Наставник", en: "A mentor" },
        description: { ru: "Найти человека, который уже прошёл мой путь", en: "Find someone who has already walked my path" },
        targetAmount: 500,
        difficultyLevel: 1
      },
      {
        key: "people.community",
        title: { ru: "Своё окружение", en: "My community" },
        description: { ru: "Познакомиться с людьми, растущими в том же направлении", en: "Meet people growing in the same direction" },
        targetAmount: 300,
        difficultyLevel: 1
      },
      {
        key: "people.partnership",
        title: { ru: "Партнёрство", en: "A partnership" },
        description: { ru: "Найти партнёра для совместного дохода", en: "Find a partner for joint income" },
        targetAmount: 2000,
        difficultyLevel: 3
      },
      {
        key: "people.network",
        title: { ru: "Сильные связи", en: "Strong connections" },
        description: { ru: "Расширить круг знакомств в своей сфере", en: "Expand my circle in my field" },
        targetAmount: 400,
        difficultyLevel: 1
      }
    ]
  }
];

export function firstWishCategoryTitle(category: FirstWishCategory, locale: "ru" | "en"): string {
  return `${category.emoji} ${category.title[locale]}`;
}