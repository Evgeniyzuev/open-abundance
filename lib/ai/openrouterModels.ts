export const OPENROUTER_MODELS = [
  {
    id: "google/gemini-2.0-flash-001",
    key: "geminiFlash",
    titleKey: "ai.openrouter.model.geminiFlash"
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    key: "llama",
    titleKey: "ai.openrouter.model.llama"
  },
  {
    id: "openai/gpt-4o-mini",
    key: "gptMini",
    titleKey: "ai.openrouter.model.gptMini"
  }
] as const;

export type OpenRouterModelId = (typeof OPENROUTER_MODELS)[number]["id"];

export const DEFAULT_OPENROUTER_MODEL: OpenRouterModelId = OPENROUTER_MODELS[0].id;

export function isAllowedOpenRouterModel(value: unknown): value is OpenRouterModelId {
  return typeof value === "string" && OPENROUTER_MODELS.some((model) => model.id === value);
}

export function getOpenRouterModel(value: string): (typeof OPENROUTER_MODELS)[number] | null {
  return OPENROUTER_MODELS.find((model) => model.id === value) ?? null;
}
