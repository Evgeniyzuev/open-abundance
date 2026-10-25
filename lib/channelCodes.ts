// Challenges "get a code through a channel": Telegram bot, web push, a message from Nova. The code is derived, not
// stored (lib/channelCodesServer.ts). Shared by the client and the server, so no server-only imports here.

export const CHANNEL_CODE_CHALLENGES = {
  code_telegram: "telegram",
  code_push: "push",
  code_nova: "nova"
} as const;

/** Event type of the push that carries a code; hidden from the in-app notification list. */
export const CHANNEL_CODE_EVENT = "challenge.channel_code";

export type ChannelCodeLogic = keyof typeof CHANNEL_CODE_CHALLENGES;
export type CodeChannel = (typeof CHANNEL_CODE_CHALLENGES)[ChannelCodeLogic];

export function isChannelCodeLogic(value: string | null | undefined): value is ChannelCodeLogic {
  return Boolean(value && Object.prototype.hasOwnProperty.call(CHANNEL_CODE_CHALLENGES, value));
}

export const CHANNEL_CODE_TEXT: Record<"ru" | "en", { title: string; body: (code: string) => string }> = {
  ru: { title: "Код для челленджа", body: (code) => `Ваш код: ${code}. Введите его в карточке челленджа.` },
  en: { title: "Your challenge code", body: (code) => `Your code: ${code}. Enter it on the challenge card.` }
};
