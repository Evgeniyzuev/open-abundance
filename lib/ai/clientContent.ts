import type { AppLocale } from "@/lib/i18n";

export type AiPromptCategory = "mechanics" | "route" | "ai" | "trust";

export type AiPrompt = {
  id: string;
  category: AiPromptCategory;
  text: string;
};

export const NOVA_NAME: Record<AppLocale, string> = {
  ru: "Нова",
  en: "Nova"
};

export const WELCOME_MESSAGES: Record<AppLocale, string> = {
  ru: "Привет! Я Нова — спокойный навигатор по Open Abundance. Помогу разобраться в идее, выбрать один понятный шаг и посмотреть на варианты без лишнего давления.",
  en: "Hello! I'm Nova, a calm guide to Open Abundance. I can help you understand an idea, choose one clear next step, and look at options without pressure."
};

export const SUGGESTED_PROMPTS: Record<AppLocale, AiPrompt[]> = {
  ru: [
    { id: "core", category: "mechanics", text: "Как работает Core?" },
    { id: "level", category: "mechanics", text: "Что открывает новый уровень?" },
    { id: "wallet", category: "mechanics", text: "Чем Wallet отличается от Core?" },
    { id: "reinvest", category: "mechanics", text: "Что такое реинвест?" },
    { id: "teams", category: "mechanics", text: "Чем полезны команды?" },
    { id: "verified-results", category: "mechanics", text: "Что считается подтверждённым результатом?" },
    { id: "wish", category: "route", text: "Как сформулировать хорошее желание?" },
    { id: "goal", category: "route", text: "Как превратить цель в понятный маршрут?" },
    { id: "today", category: "route", text: "Как выбрать действие на сегодня?" },
    { id: "challenge", category: "route", text: "Как выбрать подходящий челлендж?" },
    { id: "next-step", category: "route", text: "Помоги выбрать мой следующий шаг." },
    { id: "change-direction", category: "route", text: "Что делать, если я хочу сменить направление?" },
    { id: "ai-sees", category: "ai", text: "Что ты видишь обо мне?" },
    { id: "ai-can", category: "ai", text: "Что ты умеешь делать?" },
    { id: "ai-cannot", category: "ai", text: "Чего ты не можешь делать?" },
    { id: "correct-answer", category: "ai", text: "Как исправить твой ответ?" },
    { id: "limits", category: "trust", text: "Какие у чата сейчас лимиты?" },
    { id: "ai-error", category: "trust", text: "Что делать, если AI ошибся?" },
    { id: "no-guarantees", category: "trust", text: "Почему система не обещает доход?" },
    { id: "delete-history", category: "trust", text: "Как удалить историю чатов?" }
  ],
  en: [
    { id: "core", category: "mechanics", text: "How does Core work?" },
    { id: "level", category: "mechanics", text: "What does a new level unlock?" },
    { id: "wallet", category: "mechanics", text: "How is Wallet different from Core?" },
    { id: "reinvest", category: "mechanics", text: "What is reinvest?" },
    { id: "teams", category: "mechanics", text: "Why are teams useful?" },
    { id: "verified-results", category: "mechanics", text: "What counts as a verified result?" },
    { id: "wish", category: "route", text: "How do I formulate a useful wish?" },
    { id: "goal", category: "route", text: "How can I turn a goal into a clear route?" },
    { id: "today", category: "route", text: "How do I choose today's action?" },
    { id: "challenge", category: "route", text: "How do I choose the right challenge?" },
    { id: "next-step", category: "route", text: "Help me choose my next step." },
    { id: "change-direction", category: "route", text: "What if I want to change direction?" },
    { id: "ai-sees", category: "ai", text: "What can you see about me?" },
    { id: "ai-can", category: "ai", text: "What can you help me do?" },
    { id: "ai-cannot", category: "ai", text: "What can you not do?" },
    { id: "correct-answer", category: "ai", text: "How can I correct your answer?" },
    { id: "limits", category: "trust", text: "What are the current chat limits?" },
    { id: "ai-error", category: "trust", text: "What should I do if AI is wrong?" },
    { id: "no-guarantees", category: "trust", text: "Why does the system not promise income?" },
    { id: "delete-history", category: "trust", text: "How do I delete chat history?" }
  ]
};

export const QUICK_ACTIONS: Record<AppLocale, AiPrompt[]> = {
  ru: [
    { id: "quick-idea", category: "route", text: "Помоги разобрать мою идею." },
    { id: "quick-wish", category: "route", text: "Помоги сформулировать желание." },
    { id: "quick-step", category: "route", text: "Помоги выбрать один следующий шаг." },
    { id: "quick-mechanics", category: "mechanics", text: "Объясни механику Open Abundance простыми словами." }
  ],
  en: [
    { id: "quick-idea", category: "route", text: "Help me unpack my idea." },
    { id: "quick-wish", category: "route", text: "Help me formulate a wish." },
    { id: "quick-step", category: "route", text: "Help me choose one next step." },
    { id: "quick-mechanics", category: "mechanics", text: "Explain Open Abundance mechanics in simple terms." }
  ]
};
