// Pure helper (no imports, tested directly by node): turns the Markdown a model tends to write
// into plain conversational text. Paragraph breaks are kept; markers people do not use are dropped.

/**
 * Chats saved while the server put a newline after every streamed chunk have one fragment per line.
 * Joins them back: a single newline between fragments goes, a blank line stays as a paragraph break.
 */
export function repairChunkedText(text: string): string {
  const lines = text.split("\n").filter((line) => line.length > 0);
  if (lines.length < 12 || lines.reduce((sum, line) => sum + line.length, 0) / lines.length >= 10) return text;
  return text.split(/\n{2,}/).map((part) => part.replace(/\n/g, "")).join("\n\n");
}

export function plainChatText(input: string): string {
  let text = repairChunkedText(input.replace(/\r\n?/g, "\n"));
  text = text.replace(/```[a-z0-9_-]*\n?/gi, "").replace(/`+/g, "");
  text = text
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s*/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*[-*+•–]\s+/, "")
      .replace(/^\s*([-*_]\s*){3,}$/, ""))
    .join("\n");
  // Emphasis markers (also half-typed ones while the answer is still streaming).
  text = text.replace(/\*\*|__/g, "").replace(/(?<!\d)\*+|\*+(?!\d)/g, "");
  // [label](url) keeps the label and the address readable.
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}
