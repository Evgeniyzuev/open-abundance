/**
 * Turns notes from other apps into Open Abundance notes (no imports, tested directly by node). Everything runs on
 * the device: pasted text, Markdown and text files (Obsidian vaults, Bear, Notion exports) and Evernote .enex.
 * Apple Notes has no export, so its notes come in by copy and paste.
 */

export type ImportedNote = {
  title: string;
  body: string;
  /** Title of the list to put the note into; none means the Inbox. */
  list?: string;
  createdAt?: string;
};

export const MAX_IMPORT_NOTES = 3_000;
export const MAX_IMPORT_BODY = 20_000;
const MAX_TITLE = 120;

function makeNote(text: string, fallbackTitle: string, list?: string, createdAt?: string): ImportedNote | null {
  let body = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_IMPORT_BODY);
  let title = fallbackTitle.trim();
  if (!title) {
    // No title of its own: the first line becomes the title and leaves the text.
    const [firstLine, ...rest] = body.split("\n");
    title = firstLine.replace(/^#+\s*/, "").trim();
    body = rest.join("\n").trim();
  }
  title = title.slice(0, MAX_TITLE);
  if (!title && !body) return null;
  const note: ImportedNote = { title: title || body.slice(0, MAX_TITLE), body };
  if (list) note.list = list;
  if (createdAt) note.createdAt = createdAt;
  return note;
}

/**
 * Pasted text: notes are separated by a line of "---" when there is one, otherwise by an empty line.
 * `single` keeps everything as one note. The first line becomes the title.
 */
export function parsePastedNotes(text: string, single = false): ImportedNote[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const parts = single ? [clean] : /^\s*-{3,}\s*$/m.test(clean) ? clean.split(/^\s*-{3,}\s*$/m) : clean.split(/\n\s*\n/);
  return parts.map((part) => makeNote(part, "")).filter((note): note is ImportedNote => note !== null).slice(0, MAX_IMPORT_NOTES);
}

/**
 * A Markdown or text file. `path` is the path inside the chosen folder ("Vault/Ideas/note.md") or just the file
 * name. The first folder below the vault becomes the list; files at the top go to a list named after the vault.
 * Front matter is dropped, except tags, which stay as #tags at the end of the note.
 */
export function parseMarkdownNote(path: string, content: string): ImportedNote | null {
  const segments = path.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] ?? "";
  const folders = segments.slice(0, -1);
  const list = folders.length >= 2 ? folders[1] : folders[0];
  let text = content.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let tags: string[] = [];
  let createdAt: string | undefined;
  const frontMatter = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontMatter) {
    text = text.slice(frontMatter[0].length);
    tags = readFrontMatterTags(frontMatter[1]);
    const created = frontMatter[1].match(/^(?:created|date)\s*:\s*["']?([^"'\n]+)/m)?.[1];
    if (created && !Number.isNaN(Date.parse(created))) createdAt = new Date(created).toISOString();
  }
  const heading = text.match(/^\s*#\s+(.+)\n?/);
  const title = heading ? heading[1].trim() : fileName.replace(/\.(md|markdown|txt)$/i, "");
  if (heading) text = text.slice(heading[0].length);
  if (tags.length) text = `${text.trim()}\n\n${tags.map((tag) => `#${tag}`).join(" ")}`;
  return makeNote(text, title, list, createdAt);
}

function readFrontMatterTags(yaml: string): string[] {
  const inline = yaml.match(/^tags\s*:\s*\[(.*)\]\s*$/m);
  if (inline) return inline[1].split(",").map((tag) => tag.trim().replace(/^["'#]|["']$/g, "")).filter(Boolean);
  const block = yaml.match(/^tags\s*:\s*\n((?:\s*-\s*.+\n?)+)/m);
  if (block) return block[1].split("\n").map((line) => line.replace(/^\s*-\s*/, "").trim().replace(/^["'#]|["']$/g, "")).filter(Boolean);
  const single = yaml.match(/^tags\s*:\s*(.+)$/m);
  return single ? single[1].split(/[,\s]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean) : [];
}

/** An Evernote export (.enex). The notebook (the file name) becomes the list; tags stay as #tags. */
export function parseEnex(fileName: string, xml: string): ImportedNote[] {
  const list = fileName.replace(/\.enex$/i, "").trim() || undefined;
  const notes: ImportedNote[] = [];
  for (const match of xml.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
    const raw = match[1];
    const title = decodeEntities(raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const content = raw.match(/<content>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/content>/)?.[1] ?? "";
    const tags = [...raw.matchAll(/<tag>([\s\S]*?)<\/tag>/g)].map((tag) => decodeEntities(tag[1]).trim()).filter(Boolean);
    let body = enmlToText(content);
    if (tags.length) body = `${body}\n\n${tags.map((tag) => `#${tag.replace(/\s+/g, "_")}`).join(" ")}`;
    const note = makeNote(body, title, list, parseEnexDate(raw.match(/<created>([\dTZ]+)<\/created>/)?.[1]));
    if (note) notes.push(note);
    if (notes.length >= MAX_IMPORT_NOTES) break;
  }
  return notes;
}

function parseEnexDate(value?: string): string | undefined {
  const parts = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.000Z` : undefined;
}

/** Evernote's note markup to plain text: blocks become lines, checkboxes become [ ] and [x], links keep their address. */
export function enmlToText(enml: string): string {
  return decodeEntities(enml
    .replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<en-todo[^>]*checked="true"[^>]*\/?>/gi, "[x] ")
    .replace(/<en-todo[^>]*\/?>/gi, "[ ] ")
    .replace(/<en-media[^>]*\/?>/gi, "")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => text.replace(/<[^>]+>/g, "").trim() === href ? href : `${text} (${href})`)
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** Which files from a chosen folder are notes: Markdown and text, without app settings and trash. */
export function isImportableFile(path: string): boolean {
  if (/(^|\/)(\.obsidian|\.trash|\.git|node_modules)\//.test(path) || /(^|\/)\./.test(path.split("/").pop() ?? "")) return false;
  return /\.(md|markdown|txt|enex)$/i.test(path);
}

/** Drops notes that are already on the device (same title and text) and repeats inside the import. */
export function dropDuplicates(notes: ImportedNote[], existing: Array<{ title: string; body: string }>): ImportedNote[] {
  const key = (note: { title: string; body: string }) => `${note.title.trim().toLowerCase()}\n${note.body.trim().toLowerCase()}`;
  const seen = new Set(existing.map(key));
  return notes.filter((note) => {
    const value = key(note);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
