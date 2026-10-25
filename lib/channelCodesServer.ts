// Codes of the "get a code" challenges: HMAC of the person, the channel and the UTC day, so each channel has its own
// code and nothing is stored. Server only. No "@/" imports: tested by node.
import { createHmac } from "node:crypto";
import type { CodeChannel } from "./channelCodes.ts";

function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Six digits for this person, channel and UTC day. */
export function channelCode(secret: string, userId: string, channel: CodeChannel, at: number): string {
  const digest = createHmac("sha256", `channel-code:${secret}`).update(`${userId}:${channel}:${utcDay(at)}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** A code sent today or yesterday (UTC) is accepted, so a code sent just before midnight still works. */
export function isChannelCodeValid(secret: string, userId: string, channel: CodeChannel, code: unknown, at: number): boolean {
  const entered = String(code ?? "").replace(/\D/g, "");
  if (entered.length !== 6) return false;
  return [at, at - 86_400_000].some((day) => channelCode(secret, userId, channel, day) === entered);
}
