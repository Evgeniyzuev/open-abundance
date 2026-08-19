export type LegalLocale = "ru" | "en";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentContent = {
  title: string;
  description: string;
  notice?: string;
  sections: LegalSection[];
};

export const LEGAL_VERSION = "2026-08-10.1";

export function normalizeLegalLocale(value: unknown): LegalLocale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "ru" ? "ru" : "en";
}

export function getSupportUrl(): string {
  const fallback = "https://github.com/Evgeniyzuev/open-abundance/issues";
  const configured = process.env.SUPPORT_URL?.trim() || process.env.NEXT_PUBLIC_SUPPORT_URL?.trim();
  if (!configured) return fallback;
  const normalized = configured.toLowerCase();
  return normalized.startsWith("https://") || normalized.startsWith("mailto:") ? configured : fallback;
}

export const legalUi = {
  ru: {
    home: "Вернуться в Open Abundance",
    privacy: "Конфиденциальность",
    terms: "Условия",
    contact: "Связаться",
    updated: "Версия",
    language: "Язык документа"
  },
  en: {
    home: "Return to Open Abundance",
    privacy: "Privacy",
    terms: "Terms",
    contact: "Contact",
    updated: "Version",
    language: "Document language"
  }
} satisfies Record<LegalLocale, Record<string, string>>;

export const privacyContent: Record<LegalLocale, LegalDocumentContent> = {
  ru: {
    title: "Политика конфиденциальности",
    description: "Краткая политика обработки данных в beta-версии Open Abundance.",
    notice: "Open Abundance не продаёт персональные данные и не использует рекламные трекеры. При этом некоторые данные обрабатываются, когда пользователь создаёт аккаунт или использует серверные функции.",
    sections: [
      {
        title: "1. Статус документа и оператор",
        paragraphs: [
          "Open Abundance — ранняя beta-версия, которой управляет разработчик проекта. До коммерческого запуска сведения об операторе и применимом праве могут быть уточнены. Актуальный канал связи указан на странице «Связаться».",
          "Не отправляйте через сервис паспортные данные, данные банковских карт, seed-фразы, пароли или иные сведения, которые не нужны для работы выбранной функции."
        ]
      },
      {
        title: "2. Какие данные могут обрабатываться",
        bullets: [
          "данные аккаунта: email, идентификатор авторизации и сведения, полученные от выбранного провайдера входа;",
          "профиль и социальные функции: имя или псевдоним, username, аватар, описание, ссылки, контакты, сообщения, публикации и выбранные настройки видимости;",
          "данные функций сервиса: желания, результаты, задания, обращения к AI, сделки и действия, которые пользователь решил сохранить на сервере;",
          "данные кошелька и операций: публичные адреса, сетевые идентификаторы транзакций, суммы и история операций;",
          "технические данные: идентификатор гостя или аккаунта, события использования, сведения об ошибках, производительности, браузере и сетевом запросе."
        ]
      },
      {
        title: "3. Данные на устройстве",
        paragraphs: [
          "Часть личных заметок, задач, черновиков и истории AI-чата хранится локально в браузере пользователя. Эти данные могут быть потеряны при очистке данных сайта или смене устройства. Серверные функции при этом хранят только сведения, необходимые для их работы."
        ]
      },
      {
        title: "4. Для чего нужны данные",
        bullets: [
          "создание аккаунта, авторизация и восстановление доступа;",
          "работа профиля, публикаций, сообщений, команд, маркетплейса и кошелька;",
          "выполнение явно запрошенных AI-функций;",
          "защита от злоупотреблений, диагностика ошибок и улучшение продукта;",
          "исполнение требований закона и разрешение споров."
        ]
      },
      {
        title: "5. Поставщики и передача данных",
        paragraphs: [
          "Для работы сервиса могут использоваться Vercel (хостинг и измерение производительности), Supabase (авторизация, база данных и хранение файлов), Google или другой выбранный провайдер входа, а также AI-провайдеры. При использовании AI текст запроса и необходимый контекст передаются выбранному провайдеру для формирования ответа.",
          "Публичные данные профиля и публикаций доступны другим пользователям и посетителям в соответствии с выбранной видимостью. Ссылки на внешние сайты подчиняются правилам этих сайтов."
        ]
      },
      {
        title: "6. Аналитика и локальное хранилище",
        paragraphs: [
          "Сервис использует собственные продуктовые события, технические метрики Vercel, localStorage и IndexedDB. Они нужны для входа, сохранения локального состояния, диагностики и понимания работы функций. Если в будущем появятся рекламные или необязательные трекеры, политика и механизм согласия должны быть обновлены до их включения."
        ]
      },
      {
        title: "7. Срок хранения и права пользователя",
        paragraphs: [
          "Данные хранятся, пока они нужны для аккаунта, выбранной функции, безопасности или обязательного учёта операций. Пользователь может запросить сведения о своих данных, исправление или удаление через страницу «Связаться». Часть записей об операциях, безопасности и резервных копий может сохраняться ограниченное время, если это необходимо по закону или для защиты пользователей.",
          "Удаление локальных данных выполняется средствами браузера или удалением данных сайта."
        ]
      },
      {
        title: "8. Безопасность и изменения",
        paragraphs: [
          "Используются разумные технические и организационные меры защиты, но ни один интернет-сервис не может гарантировать абсолютную безопасность. Не передавайте коды входа, API-ключи и seed-фразы другим людям.",
          "Политика может обновляться вместе с продуктом. Существенные изменения должны сопровождаться новой версией документа и, когда это требуется, отдельным уведомлением или согласием."
        ]
      }
    ]
  },
  en: {
    title: "Privacy Policy",
    description: "A concise data-processing policy for the Open Abundance beta.",
    notice: "Open Abundance does not sell personal data or use advertising trackers. Some data is still processed when a user creates an account or uses server-backed features.",
    sections: [
      {
        title: "1. Status and operator",
        paragraphs: [
          "Open Abundance is an early beta operated by the project developer. Operator details and governing law may be clarified before commercial launch. The current support channel is listed on the Contact page.",
          "Do not submit passport details, payment-card data, seed phrases, passwords, or other information that is not required for the feature you are using."
        ]
      },
      {
        title: "2. Data that may be processed",
        bullets: [
          "account data, including email, authentication identifier, and information supplied by the selected sign-in provider;",
          "profile and social data, including a name or pseudonym, username, avatar, bio, links, contacts, messages, posts, and visibility settings;",
          "feature data, including wishes, results, challenges, AI requests, deals, and actions the user chooses to store on the server;",
          "wallet and transaction data, including public addresses, network transaction identifiers, amounts, and operation history;",
          "technical data, including a guest or account identifier, product events, errors, performance, browser, and request information."
        ]
      },
      {
        title: "3. Data on the device",
        paragraphs: [
          "Some personal notes, tasks, drafts, and AI chat history are stored locally in the user's browser. This data may be lost when site data is cleared or the device changes. Server-backed features store the information required to operate those features."
        ]
      },
      {
        title: "4. Why data is used",
        bullets: [
          "account creation, authentication, and access recovery;",
          "operation of profiles, posts, messages, teams, the marketplace, and the wallet;",
          "AI features explicitly requested by the user;",
          "abuse prevention, troubleshooting, and product improvement;",
          "legal compliance and dispute handling."
        ]
      },
      {
        title: "5. Providers and data sharing",
        paragraphs: [
          "The service may use Vercel for hosting and performance measurement, Supabase for authentication, databases, and file storage, Google or another selected sign-in provider, and AI providers. When an AI feature is used, the prompt and necessary context are sent to the selected provider to produce a response.",
          "Public profile data and posts are available to other users and visitors according to the selected visibility. External links are governed by the destination site's rules."
        ]
      },
      {
        title: "6. Analytics and local storage",
        paragraphs: [
          "The service uses first-party product events, Vercel technical metrics, localStorage, and IndexedDB for authentication, local state, diagnostics, and feature evaluation. If advertising or optional trackers are introduced, this policy and the consent mechanism must be updated before they are enabled."
        ]
      },
      {
        title: "7. Retention and user rights",
        paragraphs: [
          "Data is retained while needed for the account, selected feature, security, or required transaction records. A user may request access, correction, or deletion through the Contact page. Some transaction, security, and backup records may remain for a limited period where required by law or necessary to protect users.",
          "Local data can be removed through the browser's site-data controls."
        ]
      },
      {
        title: "8. Security and changes",
        paragraphs: [
          "Reasonable technical and organizational safeguards are used, but no online service can guarantee absolute security. Never share sign-in codes, API keys, or seed phrases.",
          "This policy may change as the product develops. Material changes should receive a new document version and, where required, a separate notice or consent."
        ]
      }
    ]
  }
};

export const termsContent: Record<LegalLocale, LegalDocumentContent> = {
  ru: {
    title: "Условия использования",
    description: "Правила использования beta-версии Open Abundance.",
    notice: "Open Abundance находится на стадии тестирования. Материалы, расчёты и ответы AI предоставляются в информационных целях и не заменяют профессиональную консультацию.",
    sections: [
      {
        title: "1. Принятие условий",
        paragraphs: [
          "Используя Open Abundance или создавая аккаунт, пользователь принимает эти Условия и подтверждает ознакомление с Политикой конфиденциальности. Если пользователь не согласен, ему следует прекратить использование сервиса."
        ]
      },
      {
        title: "2. Beta-версия",
        paragraphs: [
          "Сервис развивается и может содержать ошибки. Функции, лимиты, правила начислений и доступность могут меняться или временно отключаться. Тестовые показатели и демонстрационные данные не создают обязательства произвести выплату или предоставить услугу."
        ]
      },
      {
        title: "3. Аккаунт и безопасность",
        bullets: [
          "предоставляйте корректные данные и используйте только свой способ входа;",
          "не передавайте коды входа, API-ключи, пароли и seed-фразы;",
          "немедленно сообщайте о подозрительном доступе;",
          "не используйте сервис для обхода закона, обмана, спама, вредоносного кода или нарушения прав других лиц."
        ]
      },
      {
        title: "4. Пользовательский контент",
        paragraphs: [
          "Пользователь сохраняет права на созданный им контент и предоставляет сервису ограниченное разрешение хранить, обрабатывать и показывать его в объёме, необходимом для выбранной функции и настроек видимости. Пользователь отвечает за законность контента и наличие необходимых разрешений.",
          "Сервис может скрыть или удалить незаконный, опасный, вводящий в заблуждение или нарушающий права контент, а также ограничить аккаунт, который систематически нарушает правила."
        ]
      },
      {
        title: "5. AI и материалы о благополучии",
        paragraphs: [
          "Ответы AI могут быть неточными, неполными или устаревшими. Они не являются юридической, медицинской, психологической, финансовой или инвестиционной консультацией и не устанавливают диагноз. В важных ситуациях обратитесь к квалифицированному специалисту.",
          "Пользователь должен проверять существенные факты и не передавать AI секреты или лишние персональные данные."
        ]
      },
      {
        title: "6. CORE, расчёты и доход",
        paragraphs: [
          "CORE и отображаемые прогнозы являются показателями и расчётными иллюстрациями внутри продукта, если конкретная операция прямо не устанавливает иное. Они не гарантируют доход, рыночную стоимость, ликвидность, выкуп или будущий результат. Прошлые и расчётные показатели не являются обещанием результата."
        ]
      },
      {
        title: "7. Криптоактивы и кошелёк",
        paragraphs: [
          "Операции с TON, USDT и другими криптоактивами связаны с волатильностью, комиссиями, техническими и регуляторными рисками и могут быть необратимыми. Пользователь самостоятельно проверяет адрес, сеть, сумму и законность операции в своей юрисдикции.",
          "Не используйте криптофункции, если вам нет 18 лет или такие операции запрещены применимым правом."
        ]
      },
      {
        title: "8. Маркетплейс и сделки",
        paragraphs: [
          "Описание предложения, цена, срок, версия условий и правила конкретной сделки имеют приоритет для этой сделки. Пользователи отвечают за свои предложения, исполнение обязательств, налоги и соблюдение закона. Наличие escrow или механизма спора снижает отдельные риски, но не гарантирует качество, законность или успешный результат сделки."
        ]
      },
      {
        title: "9. Внешние сервисы",
        paragraphs: [
          "Авторизация, хостинг, блокчейн-сети, AI и внешние ссылки зависят от третьих сторон и их правил. Open Abundance не контролирует их непрерывную доступность, комиссии, задержки и изменения политик."
        ]
      },
      {
        title: "10. Ответственность",
        paragraphs: [
          "В пределах, разрешённых законом, сервис предоставляется «как есть» без гарантии непрерывной или безошибочной работы. Ограничения ответственности не отменяют права потребителя и другие обязательные гарантии, которые нельзя исключить соглашением.",
          "Пользователь самостоятельно принимает решения на основе информации сервиса и обязан использовать разумные меры безопасности."
        ]
      },
      {
        title: "11. Прекращение и изменения",
        paragraphs: [
          "Пользователь может прекратить использование сервиса и запросить удаление аккаунта. Доступ может быть ограничен для защиты пользователей, исполнения закона или при существенном нарушении условий.",
          "Условия могут обновляться. Существенные изменения получают новую версию и, когда это требуется, отдельное уведомление или повторное принятие. Вопросы можно направить через страницу «Связаться»."
        ]
      }
    ]
  },
  en: {
    title: "Terms of Use",
    description: "Rules for using the Open Abundance beta.",
    notice: "Open Abundance is in testing. Content, calculations, and AI responses are informational and do not replace professional advice.",
    sections: [
      {
        title: "1. Acceptance",
        paragraphs: [
          "By using Open Abundance or creating an account, the user accepts these Terms and acknowledges the Privacy Policy. If the user does not agree, they should stop using the service."
        ]
      },
      {
        title: "2. Beta service",
        paragraphs: [
          "The service is evolving and may contain errors. Features, limits, reward rules, and availability may change or be temporarily disabled. Test metrics and demo data do not create an obligation to make a payment or provide a service."
        ]
      },
      {
        title: "3. Account and security",
        bullets: [
          "provide accurate information and use only your own sign-in method;",
          "never share sign-in codes, API keys, passwords, or seed phrases;",
          "report suspected unauthorized access promptly;",
          "do not use the service for unlawful activity, fraud, spam, malicious code, or infringement of others' rights."
        ]
      },
      {
        title: "4. User content",
        paragraphs: [
          "The user keeps ownership of their content and grants the service limited permission to store, process, and display it as required by the selected feature and visibility settings. The user is responsible for the content's legality and required permissions.",
          "The service may hide or remove unlawful, dangerous, deceptive, or infringing content and may restrict accounts that repeatedly violate the rules."
        ]
      },
      {
        title: "5. AI and wellbeing content",
        paragraphs: [
          "AI responses may be inaccurate, incomplete, or outdated. They are not legal, medical, psychological, financial, or investment advice and do not provide a diagnosis. Consult a qualified professional for important decisions.",
          "Users should verify material facts and should not send secrets or unnecessary personal data to AI features."
        ]
      },
      {
        title: "6. CORE, estimates, and earnings",
        paragraphs: [
          "CORE and displayed projections are in-product metrics and calculated illustrations unless a specific transaction expressly says otherwise. They do not guarantee income, market value, liquidity, redemption, or future results. Historical and projected values are not promises of performance."
        ]
      },
      {
        title: "7. Cryptoassets and wallet",
        paragraphs: [
          "TON, USDT, and other cryptoasset operations involve volatility, fees, technical risk, regulatory risk, and potentially irreversible transactions. The user must verify the address, network, amount, and legality of each transaction in their jurisdiction.",
          "Do not use crypto features if you are under 18 or if such activity is prohibited by applicable law."
        ]
      },
      {
        title: "8. Marketplace and deals",
        paragraphs: [
          "The listing description, price, deadline, terms version, and deal-specific rules govern that deal. Users are responsible for their listings, performance, taxes, and legal compliance. Escrow or dispute tooling may reduce individual risks but does not guarantee quality, legality, or a successful outcome."
        ]
      },
      {
        title: "9. Third-party services",
        paragraphs: [
          "Authentication, hosting, blockchain networks, AI, and external links depend on third parties and their terms. Open Abundance does not control their continuous availability, fees, delays, or policy changes."
        ]
      },
      {
        title: "10. Liability",
        paragraphs: [
          "To the extent permitted by law, the service is provided as is without a guarantee of uninterrupted or error-free operation. These limitations do not waive consumer rights or other mandatory protections that cannot be excluded by agreement.",
          "Users make their own decisions based on service information and are responsible for using reasonable security measures."
        ]
      },
      {
        title: "11. Termination and changes",
        paragraphs: [
          "A user may stop using the service and request account deletion. Access may be restricted to protect users, comply with law, or address a material breach of these Terms.",
          "These Terms may change. Material changes receive a new version and, where required, a separate notice or renewed acceptance. Questions can be submitted through the Contact page."
        ]
      }
    ]
  }
};

export const contactContent: Record<LegalLocale, LegalDocumentContent> = {
  ru: {
    title: "Связаться",
    description: "Поддержка, вопросы о данных и сообщения о проблемах.",
    notice: "Сейчас обращения принимаются через трекер проекта. Не публикуйте в обращении пароли, коды входа, API-ключи, seed-фразы, документы или другие конфиденциальные сведения.",
    sections: [
      {
        title: "Поддержка и запросы о данных",
        paragraphs: [
          "Через канал поддержки можно сообщить об ошибке, задать вопрос, запросить доступ, исправление или удаление данных. Если вопрос требует конфиденциального обмена, создайте обращение без персональных деталей и попросите предоставить закрытый канал связи."
        ]
      },
      {
        title: "Безопасность",
        paragraphs: [
          "Не прикладывайте секреты или персональные документы. Для сообщения об уязвимости укажите только безопасные шаги воспроизведения и дождитесь закрытого канала перед передачей чувствительных технических деталей."
        ]
      }
    ]
  },
  en: {
    title: "Contact",
    description: "Support, data requests, and problem reports.",
    notice: "Requests are currently accepted through the project tracker. Do not post passwords, sign-in codes, API keys, seed phrases, identity documents, or other confidential information.",
    sections: [
      {
        title: "Support and data requests",
        paragraphs: [
          "Use the support channel to report a problem, ask a question, or request access, correction, or deletion of data. If the request requires confidential communication, open a request without personal details and ask for a private channel."
        ]
      },
      {
        title: "Security",
        paragraphs: [
          "Do not attach secrets or personal documents. For a vulnerability report, provide only safe reproduction steps and wait for a private channel before sharing sensitive technical details."
        ]
      }
    ]
  }
};
