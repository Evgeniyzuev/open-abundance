// Pure helper (no imports, tested directly by node): turns the Markdown a model tends to write
// into plain conversational text. Paragraph breaks are kept; markers people do not use are dropped.

export function plainChatText(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");
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
