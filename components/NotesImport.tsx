"use client";

import { useRef, useState } from "react";
import { FileText, FolderOpen } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import {
  dropDuplicates,
  isImportableFile,
  MAX_IMPORT_NOTES,
  parseEnex,
  parseMarkdownNote,
  parsePastedNotes,
  type ImportedNote
} from "@/lib/notesImport";
import { getLists, getNotes, importNotesBatch, saveList } from "@/lib/notesStore";

const IMPORT_LIST_COLORS = ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#8e8e93"];

/**
 * Import from other apps, all on the device: paste text (Apple Notes and anything else), pick Markdown or text
 * files or a whole Obsidian folder, or an Evernote .enex. Folders and notebooks become lists.
 */
export default function NotesImport({ onClose, onDone }: { onClose: () => void; onDone: (count: number) => void }) {
  const { t } = useUserContext();
  const [text, setText] = useState("");
  const [single, setSingle] = useState(false);
  const [fromFiles, setFromFiles] = useState<ImportedNote[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const notes = [...parsePastedNotes(text, single), ...fromFiles].slice(0, MAX_IMPORT_NOTES);
  const listTitles = [...new Set(notes.map((note) => note.list).filter((list): list is string => Boolean(list)))];

  async function readFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    setBusy(true);
    try {
      const parsed: ImportedNote[] = [];
      let read = 0;
      for (const file of Array.from(fileList)) {
        const path = file.webkitRelativePath || file.name;
        if (!isImportableFile(path)) continue;
        const content = await file.text();
        read += 1;
        if (/\.enex$/i.test(path)) parsed.push(...parseEnex(file.name, content));
        else {
          const note = parseMarkdownNote(path, content);
          if (note) parsed.push(note);
        }
        if (parsed.length >= MAX_IMPORT_NOTES) break;
      }
      setFromFiles((current) => [...current, ...parsed]);
      setFileCount((current) => current + read);
      if (read === 0) setError(t("notes.import.noFiles"));
    } catch {
      setError(t("notes.import.readError"));
    } finally {
      setBusy(false);
      if (filesRef.current) filesRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }

  async function runImport() {
    if (notes.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const [existingNotes, lists] = await Promise.all([getNotes(), getLists()]);
      const fresh = dropDuplicates(notes, existingNotes.filter((note) => !note.deleted));
      // Folders and notebooks become lists; a list with the same name is reused.
      const listIds = new Map(lists.map((list) => [list.title.trim().toLowerCase(), list.id]));
      let colorIndex = lists.length;
      for (const title of new Set(fresh.map((note) => note.list).filter((list): list is string => Boolean(list)))) {
        if (listIds.has(title.trim().toLowerCase())) continue;
        const id = crypto.randomUUID();
        await saveList({ id, title: title.slice(0, 60), icon: "📁", color: IMPORT_LIST_COLORS[colorIndex++ % IMPORT_LIST_COLORS.length], syncStatus: "local" });
        listIds.set(title.trim().toLowerCase(), id);
      }
      const count = await importNotesBatch(fresh.map((note) => ({
        title: note.title,
        body: note.body,
        listId: note.list ? listIds.get(note.list.trim().toLowerCase()) : undefined,
        createdAt: note.createdAt
      })));
      onDone(count);
    } catch {
      setError(t("notes.import.saveError"));
      setBusy(false);
    }
  }

  // Folder picking is a non-standard attribute; React passes it through as written.
  const folderProps = { webkitdirectory: "", directory: "" } as Record<string, string>;

  return (
    <Sheet bare fullscreen className="notes-import" ariaLabel={t("notes.import.title")} closeLabel={t("app.common.close")} onClose={onClose}>
      <div className="notes-detail-body">
        <h2 className="notes-import-title">{t("notes.import.title")}</h2>
        <p className="notes-import-hint">{t("notes.import.hint")}</p>

        <section className="notes-import-block">
          <h3>{t("notes.import.pasteTitle")}</h3>
          <textarea rows={6} aria-label={t("notes.import.pasteTitle")} placeholder={t("notes.import.pastePlaceholder")} value={text} onChange={(event) => setText(event.target.value)} />
          <label className="notes-import-check">
            <input type="checkbox" checked={single} onChange={(event) => setSingle(event.target.checked)} />
            <span>{t("notes.import.single")}</span>
          </label>
        </section>

        <section className="notes-import-block">
          <h3>{t("notes.import.filesTitle")}</h3>
          <p className="notes-import-hint">{t("notes.import.filesHint")}</p>
          <div className="notes-import-pickers">
            <button type="button" disabled={busy} onClick={() => filesRef.current?.click()}><FileText size={18} aria-hidden="true" /> {t("notes.import.pickFiles")}</button>
            <button type="button" disabled={busy} onClick={() => folderRef.current?.click()}><FolderOpen size={18} aria-hidden="true" /> {t("notes.import.pickFolder")}</button>
          </div>
          <input ref={filesRef} type="file" multiple hidden accept=".md,.markdown,.txt,.enex,text/markdown,text/plain" onChange={(event) => void readFiles(event.target.files)} />
          <input ref={folderRef} type="file" multiple hidden {...folderProps} onChange={(event) => void readFiles(event.target.files)} />
          {fileCount > 0 ? <p className="notes-import-hint">{t("notes.import.filesRead", { count: fileCount })}</p> : null}
        </section>

        {notes.length > 0 ? (
          <section className="notes-import-preview" aria-live="polite">
            <strong>{listTitles.length ? t("notes.import.foundInLists", { count: notes.length, lists: listTitles.length }) : t("notes.import.found", { count: notes.length })}</strong>
            <ul>
              {notes.slice(0, 5).map((note, index) => <li key={`${note.title}-${index}`}>{note.title}{note.list ? <small> · {note.list}</small> : null}</li>)}
            </ul>
          </section>
        ) : null}

        {error ? <p className="notes-ai-error" role="alert">{error}</p> : null}

        <button className="notes-about-ok" type="button" disabled={notes.length === 0 || busy} onClick={() => void runImport()}>
          {t("notes.import.run", { count: notes.length })}
        </button>
      </div>
    </Sheet>
  );
}
