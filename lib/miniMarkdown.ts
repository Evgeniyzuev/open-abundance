// A tiny Markdown reader for product texts: headings, paragraphs, lists, quotes, tables and **bold**. It returns a
// plain data tree (no HTML), so the page renders it with React elements and nothing from the text is ever executed.
// No imports: tested directly by node.

export type MdInline = { text: string; bold: boolean };
export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; inline: MdInline[] }
  | { type: "paragraph"; inline: MdInline[] }
  | { type: "list"; ordered: boolean; items: MdInline[][] }
  | { type: "quote"; inline: MdInline[] }
  | { type: "table"; head: MdInline[][]; rows: MdInline[][][] };

export function parseInline(text: string): MdInline[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }
  );
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, inline: parseInline(heading[2]) });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|") && lines[index + 1]?.match(/^\s*\|?\s*:?-{2,}/)) {
      const head = cells(line).map(parseInline);
      index += 2;
      const rows: MdInline[][][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(cells(lines[index]).map(parseInline));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: MdInline[][] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(parseInline(lines[index].replace(pattern, "")));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", inline: parseInline(quote.join(" ")) });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", inline: parseInline(paragraph.join(" ")) });
    else index += 1;
  }
  return blocks;
}
