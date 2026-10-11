// Pure helpers for @nickname mentions in posts and comments. No imports: tested directly by node.

export const MAX_MENTIONS_PER_TEXT = 5;

const MENTION = /(^|[^a-z0-9@_.\/])@([a-z][a-z0-9]{4,23})(?![a-z0-9])/gi;

/** Distinct nicknames mentioned in a text (lower case, in order, at most MAX_MENTIONS_PER_TEXT). */
export function extractMentions(text: unknown): string[] {
  if (typeof text !== "string" || !text.includes("@")) return [];
  const found: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const name = match[2].toLowerCase();
    if (!found.includes(name)) found.push(name);
    if (found.length >= MAX_MENTIONS_PER_TEXT) break;
  }
  return found;
}

export type MentionPart = { text: string; mention?: string };

/** Splits a text into plain parts and `@nickname` parts for rendering as links. */
export function splitMentions(text: string): MentionPart[] {
  if (!text.includes("@")) return [{ text }];
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: `@${match[2]}`, mention: match[2].toLowerCase() });
    last = start + match[2].length + 1;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
