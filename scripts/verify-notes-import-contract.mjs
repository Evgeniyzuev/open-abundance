import assert from "node:assert/strict";
import { dropDuplicates, enmlToText, isImportableFile, parseEnex, parseMarkdownNote, parsePastedNotes } from "../lib/notesImport.ts";

// Pasted text: empty lines split notes, a line of --- wins over empty lines, first line is the title.
assert.deepEqual(parsePastedNotes("Купить хлеб\n\nПозвонить маме\nв субботу"), [
  { title: "Купить хлеб", body: "" },
  { title: "Позвонить маме", body: "в субботу" }
]);
assert.equal(parsePastedNotes("Идея\n\nподробности\n---\nВторая").length, 2);
assert.deepEqual(parsePastedNotes("Один\n\nдва", true), [{ title: "Один", body: "два" }]);
assert.deepEqual(parsePastedNotes("   \n "), []);

// Markdown: heading or file name is the title, the folder below the vault is the list, tags stay.
const md = parseMarkdownNote("Vault/Ideas/Map.md", "---\ntags: [oa, map]\ncreated: 2024-05-01\n---\n# Карта изобилия\nСады вокруг ядра");
assert.deepEqual(md, { title: "Карта изобилия", body: "Сады вокруг ядра\n\n#oa #map", list: "Ideas", createdAt: "2024-05-01T00:00:00.000Z" });
assert.equal(parseMarkdownNote("Vault/Inbox note.md", "text").list, "Vault");
assert.equal(parseMarkdownNote("Inbox note.txt", "text").list, undefined);
assert.equal(parseMarkdownNote("Inbox note.txt", "text").title, "Inbox note");
assert.deepEqual(parseMarkdownNote("V/a.md", "---\ntags:\n  - one\n  - two\n---\nbody").body, "body\n\n#one #two");

// Folder picking skips app settings, trash, hidden files and attachments.
assert.equal(isImportableFile("Vault/.obsidian/app.json"), false);
assert.equal(isImportableFile("Vault/.trash/old.md"), false);
assert.equal(isImportableFile("Vault/img.png"), false);
assert.equal(isImportableFile("Vault/notes/a.md"), true);
assert.equal(isImportableFile("Export.enex"), true);

// Evernote: notebook = file name, ENML to text with checkboxes and links, tags and creation date kept.
const enex = `<?xml version="1.0"?><en-export><note><title>Покупки &amp; дела</title><content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "x"><en-note><div><en-todo checked="true"/>молоко</div><div><en-todo/>хлеб</div><div><a href="https://oa.app">сайт</a></div></en-note>]]></content><created>20230102T030405Z</created><tag>дом</tag></note><note><title></title><content><![CDATA[<en-note></en-note>]]></content></note></en-export>`;
assert.deepEqual(parseEnex("Личное.enex", enex), [{
  title: "Покупки & дела",
  body: "[x] молоко\n[ ] хлеб\nсайт (https://oa.app)\n\n#дом",
  list: "Личное",
  createdAt: "2023-01-02T03:04:05.000Z"
}]);
assert.equal(enmlToText("<ul><li>a</li><li>b</li></ul>"), "- a\n- b");

// Notes already on the device and repeats inside the import are skipped.
assert.deepEqual(dropDuplicates([{ title: "A", body: "x" }, { title: "a", body: "X" }, { title: "B", body: "" }], [{ title: "B", body: "" }]), [{ title: "A", body: "x" }]);

console.log("notes import contract ok");
