"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Inbox, ListPlus, MoreHorizontal, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import {
  deleteList,
  deleteNote,
  getLists,
  getNotes,
  Note,
  ReminderList,
  saveList,
  saveNote,
  toggleNoteCompleted,
  NOTES_CHANGED_EVENT
} from "@/lib/notesStore";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import BackupReminder from "@/components/BackupReminder";
import LocalDataNotice from "@/components/LocalDataNotice";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { takeQuickAction } from "@/lib/quickAction";

type LocalDataStatus = "loading" | "slow" | "ready" | "error";
/** "inbox" is the built-in list that cannot be deleted: every note without a list of its own lives there. */
type ViewId = "today" | "planned" | "all" | "completed" | "inbox" | `list:${string}`;
type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

type SmartList = {
  id: Exclude<ViewId, "inbox" | `list:${string}`>;
  titleKey: MessageKey;
  Icon: typeof CalendarDays;
  tone: string;
};

const smartLists: SmartList[] = [
  { id: "today", titleKey: "notes.smart.today", Icon: CalendarDays, tone: "blue" },
  { id: "planned", titleKey: "notes.smart.planned", Icon: CalendarClock, tone: "red" },
  { id: "all", titleKey: "notes.smart.all", Icon: Inbox, tone: "black" },
  { id: "completed", titleKey: "notes.smart.completed", Icon: Check, tone: "gray" }
];

const INBOX_COLOR = "#af52de";
const listColors = ["#ff9500", "#007aff", "#34c759", "#ff3b30", "#af52de", "#8e8e93"];
const emptyListForm = { title: "", icon: "📝", color: "#007aff" };

/** What the full-screen note page is showing: an existing note, or a new one going into a list (or the Inbox). */
type NoteTarget = { id: string; isNew: boolean; listId?: string };

export default function NotesApp() {
  const { locale, t } = useUserContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [view, setView] = useState<ViewId | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingLists, setEditingLists] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [aiHint, setAiHint] = useState(false);
  const [localDataStatus, setLocalDataStatus] = useState<LocalDataStatus>("loading");
  const localLoadRequestRef = useRef(0);

  const refreshData = useCallback(async () => {
    const [storedNotes, storedLists] = await Promise.all([getNotes(), getLists()]);
    setNotes(storedNotes.filter((note) => !note.deleted));
    setLists(storedLists);
  }, []);

  const loadLocalData = useCallback(async () => {
    const requestId = localLoadRequestRef.current + 1;
    localLoadRequestRef.current = requestId;
    setLocalDataStatus("loading");
    const slowTimer = window.setTimeout(() => {
      if (localLoadRequestRef.current === requestId) setLocalDataStatus("slow");
    }, 1500);

    try {
      await refreshData();
      if (localLoadRequestRef.current === requestId) setLocalDataStatus("ready");
    } catch (loadError) {
      console.warn("Notes local data load failed", loadError);
      if (localLoadRequestRef.current === requestId) setLocalDataStatus("error");
    } finally {
      window.clearTimeout(slowTimer);
    }
  }, [refreshData]);

  useEffect(() => {
    void loadLocalData();
    return () => { localLoadRequestRef.current += 1; };
  }, [loadLocalData]);

  useEffect(() => {
    // Notes written elsewhere (backup restore, other screens) appear without reopening the screen.
    const refresh = () => void refreshData().catch(() => undefined);
    window.addEventListener(NOTES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, refresh);
  }, [refreshData]);

  useEffect(() => {
    // App shortcut "Capture a thought" opens a new note in the Inbox.
    if (takeQuickAction("capture")) setNoteTarget({ id: crypto.randomUUID(), isNew: true });
  }, []);

  useEffect(() => {
    if (!aiHint) return;
    const timeoutId = window.setTimeout(() => setAiHint(false), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [aiHint]);

  const visibleNotes = useMemo(() => (view ? sortNotes(filterNotes(notes, view)) : []), [notes, view]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return sortNotes(notes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(needle)));
  }, [notes, query]);

  function openNewNote() {
    const listId = view?.startsWith("list:") ? view.slice(5) : undefined;
    setNoteTarget({ id: crypto.randomUUID(), isNew: true, listId });
  }

  async function completeNote(note: Note) {
    await toggleNoteCompleted(note.id);
    await refreshData();
  }

  async function createList(form: typeof emptyListForm) {
    const id = crypto.randomUUID();
    await saveList({ id, title: form.title, icon: form.icon.trim() || "•", color: form.color, syncStatus: "local" });
    setListModalOpen(false);
    setView(`list:${id}`);
    await refreshData();
  }

  async function removeList(list: ReminderList) {
    if (!window.confirm(t("notes.deleteListConfirm", { title: list.title }))) return;
    await deleteList(list.id);
    if (view === `list:${list.id}`) setView(null);
    await refreshData();
  }

  const activeList = view?.startsWith("list:") ? lists.find((list) => list.id === view.slice(5)) : undefined;
  const editingNote = noteTarget && !noteTarget.isNew ? notes.find((note) => note.id === noteTarget.id) : undefined;

  return (
    <section className="reminders-app notes-ios">
      <LocalDataNotice status={localDataStatus} onRetry={() => void loadLocalData()} />
      {localDataStatus === "ready" ? <BackupReminder records={notes} /> : null}

      {searchOpen ? (
        <div className="notes-search-screen">
          <div className="notes-search-bar">
            <label>
              <Search size={18} aria-hidden="true" />
              <input autoFocus type="search" aria-label={t("app.common.search")} placeholder={t("app.common.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button className="text-button" type="button" onClick={() => { setSearchOpen(false); setQuery(""); }}>{t("app.common.cancel")}</button>
          </div>
          {query.trim() ? (
            <NoteRows notes={searchResults} lists={lists} locale={locale} emptyKey="notes.searchEmpty" onComplete={completeNote} onOpen={(note) => setNoteTarget({ id: note.id, isNew: false })} onAi={() => setAiHint(true)} />
          ) : null}
        </div>
      ) : view ? (
        <section className="notes-list-screen">
          <header className="notes-list-topbar">
            <button className="notes-back" type="button" onClick={() => setView(null)}>
              <ChevronLeft size={24} aria-hidden="true" />
              <span>{t("notes.lists")}</span>
            </button>
            {activeList ? (
              <button className="notes-icon-button" type="button" aria-label={t("notes.deleteListLabel", { title: activeList.title })} onClick={() => void removeList(activeList)}>
                <Trash2 size={19} aria-hidden="true" />
              </button>
            ) : null}
          </header>
          <h1 className="notes-list-title" style={{ color: viewColor(view, lists) }}>{getViewTitle(view, lists, t)}</h1>
          <NoteRows notes={visibleNotes} lists={view.startsWith("list:") || view === "inbox" ? [] : lists} locale={locale} emptyKey="notes.emptyList" onComplete={completeNote} onOpen={(note) => setNoteTarget({ id: note.id, isNew: false })} onAi={() => setAiHint(true)} />
        </section>
      ) : (
        <>
          <header className="notes-home-topbar">
            <div className="notes-toolbar">
              <button type="button" aria-label={t("app.common.search")} onClick={() => setSearchOpen(true)}><Search size={21} aria-hidden="true" /></button>
              <button type="button" aria-label={t("notes.createList")} onClick={() => setListModalOpen(true)}><ListPlus size={22} aria-hidden="true" /></button>
              <button type="button" aria-label={t("notes.more")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={22} aria-hidden="true" /></button>
            </div>
            {menuOpen ? (
              <div className="notes-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setListModalOpen(true); }}>{t("notes.newList")}</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setEditingLists((value) => !value); }}>{t(editingLists ? "app.common.done" : "notes.editLists")}</button>
              </div>
            ) : null}
          </header>

          <div className="notes-smart-grid">
            {smartLists.map(({ id, titleKey, Icon, tone }) => (
              <button key={id} className={`notes-smart-card ${tone}`} type="button" onClick={() => setView(id)}>
                <span className="notes-smart-icon"><Icon size={22} aria-hidden="true" /></span>
                <strong>{filterNotes(notes, id).length}</strong>
                <span>{t(titleKey)}</span>
              </button>
            ))}
          </div>

          <section className="notes-my-lists">
            <h2>{t("notes.myLists")}</h2>
            <div className="notes-list-card">
              <ListRow color={INBOX_COLOR} icon={<Inbox size={19} aria-hidden="true" />} title={t("notes.inbox")} count={filterNotes(notes, "inbox").length} onOpen={() => setView("inbox")} />
              {lists.map((list) => (
                <ListRow
                  key={list.id}
                  color={list.color}
                  icon={list.icon}
                  title={list.title}
                  count={filterNotes(notes, `list:${list.id}`).length}
                  onOpen={() => setView(`list:${list.id}`)}
                  onDelete={editingLists ? () => void removeList(list) : undefined}
                  deleteLabel={t("notes.deleteListLabel", { title: list.title })}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {!searchOpen && view !== "completed" ? (
        <button className="notes-fab" type="button" aria-label={t("notes.createNote")} onClick={openNewNote}><Plus size={30} aria-hidden="true" /></button>
      ) : null}

      {aiHint ? <div className="notes-toast" role="status">{t("notes.aiSoon")}</div> : null}

      {noteTarget && (noteTarget.isNew || editingNote) ? (
        <NoteDetail
          key={noteTarget.id}
          note={editingNote}
          target={noteTarget}
          lists={lists}
          locale={locale}
          onAi={() => setAiHint(true)}
          onClose={async () => { setNoteTarget(null); await refreshData(); }}
        />
      ) : null}

      {listModalOpen ? <ListModal onClose={() => setListModalOpen(false)} onSubmit={(form) => void createList(form)} /> : null}
    </section>
  );
}

function ListRow({ color, icon, title, count, onOpen, onDelete, deleteLabel }: {
  color: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  onOpen: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <div className="notes-list-row">
      {onDelete ? <button className="notes-row-delete" type="button" aria-label={deleteLabel} onClick={onDelete}><X size={14} aria-hidden="true" /></button> : null}
      <button className="notes-list-open" type="button" onClick={onOpen}>
        <span className="notes-list-icon" style={{ backgroundColor: color }}>{icon}</span>
        <span className="notes-list-name">{title}</span>
        <strong>{count}</strong>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function NoteRows({ notes, lists, locale, emptyKey, onComplete, onOpen, onAi }: {
  notes: Note[];
  lists: ReminderList[];
  locale: AppLocale;
  emptyKey: MessageKey;
  onComplete: (note: Note) => void;
  onOpen: (note: Note) => void;
  onAi: () => void;
}) {
  const { t } = useUserContext();
  if (notes.length === 0) return <p className="notes-empty">{t(emptyKey)}</p>;
  return (
    <div className="notes-rows">
      {notes.map((note) => {
        const list = lists.find((item) => item.id === note.listId);
        return (
          <article className={`notes-row${note.completed ? " completed" : ""}`} key={note.id}>
            <button className="notes-check" type="button" aria-label={t("notes.complete")} aria-pressed={note.completed} onClick={() => onComplete(note)}>
              {note.completed ? <Check size={14} aria-hidden="true" /> : null}
            </button>
            <button className="notes-row-text" type="button" onClick={() => onOpen(note)}>
              <span>{note.title}</span>
              {note.body && note.body !== note.title ? <small>{note.body}</small> : null}
              {note.reminders.length > 0 ? <em>{note.reminders.map((reminder) => formatReminder(reminder, locale)).join(" · ")}</em> : null}
              {list ? <i>{list.icon} {list.title}</i> : null}
            </button>
            <button className="notes-ai-button" type="button" aria-label={t("notes.aiLabel")} onClick={onAi}>AI</button>
          </article>
        );
      })}
    </div>
  );
}

/**
 * The full-screen note page: edit in place like iPhone Notes, saved when it closes
 * (cross, Back, or a swipe from the left edge). An untouched new note is discarded.
 */
function NoteDetail({ note, target, lists, locale, onAi, onClose }: {
  note?: Note;
  target: NoteTarget;
  lists: ReminderList[];
  locale: AppLocale;
  onAi: () => void;
  onClose: () => Promise<void>;
}) {
  const { t } = useUserContext();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [listId, setListId] = useState(note?.listId ?? target.listId ?? "");
  const [reminders, setReminders] = useState<string[]>(note?.reminders ?? []);
  const [reminderDraft, setReminderDraft] = useState("");
  const closingRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = bodyRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [body]);

  async function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    const nextTitle = title.trim();
    const nextBody = body.trim();
    const changed = !note || nextTitle !== note.title || nextBody !== note.body || (listId || undefined) !== note.listId || reminders.join() !== note.reminders.join();
    if ((nextTitle || nextBody) && changed) {
      await saveNote({
        id: target.id,
        title: nextTitle || nextBody.split("\n")[0].slice(0, 80) || t("notes.untitled"),
        body: nextBody,
        listId: listId || undefined,
        reminders,
        syncStatus: "local"
      });
    }
    await onClose();
  }

  async function remove() {
    closingRef.current = true;
    if (note) await deleteNote(note.id);
    await onClose();
  }

  function addReminder() {
    if (!reminderDraft) return;
    setReminders((current) => [...new Set([...current, new Date(reminderDraft).toISOString()])].sort());
    setReminderDraft("");
  }

  return (
    <Sheet bare fullscreen className="notes-detail" ariaLabel={target.isNew ? t("notes.newNote") : t("notes.note")} closeLabel={t("app.common.close")} onClose={() => void close()}>
      <div className="notes-detail-body">
        <input className="notes-detail-title" aria-label={t("notes.titleLabel")} autoFocus={target.isNew} placeholder={t("notes.titlePlaceholder")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea ref={bodyRef} className="notes-detail-text" aria-label={t("notes.bodyLabel")} placeholder={t("notes.bodyPlaceholder")} rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
        <MediaUrlHelp t={t} />

        <div className="notes-detail-group">
          <label className="notes-detail-field">
            <span>{t("notes.list")}</span>
            <select value={listId} onChange={(event) => setListId(event.target.value)}>
              <option value="">{t("notes.inbox")}</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.icon} {list.title}</option>)}
            </select>
          </label>
          <div className="notes-detail-field stacked">
            <span>{t("notes.reminder")}</span>
            <div className="notes-detail-date">
              <input type="datetime-local" aria-label={t("notes.reminder")} value={reminderDraft} onChange={(event) => setReminderDraft(event.target.value)} />
              <button className="text-button" type="button" disabled={!reminderDraft} onClick={addReminder}>{t("notes.addDate")}</button>
            </div>
          </div>
          {reminders.length > 0 ? (
            <div className="notes-detail-chips">
              {reminders.map((reminder) => (
                <button className="chip" key={reminder} type="button" onClick={() => setReminders((current) => current.filter((value) => value !== reminder))}>
                  {formatReminder(reminder, locale)} <X size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="notes-detail-ai" type="button" onClick={onAi}>
          <Sparkles size={18} aria-hidden="true" />
          <span>{t("notes.aiAction")}</span>
        </button>

        {note ? (
          <button className="notes-detail-delete" type="button" onClick={() => void remove()}>
            <Trash2 size={18} aria-hidden="true" />
            <span>{t("app.common.delete")}</span>
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}

function ListModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: typeof emptyListForm) => void }) {
  const { t } = useUserContext();
  const [form, setForm] = useState(emptyListForm);

  return (
    <Sheet
      as="form"
      bare
      dismissible={false}
      ariaLabel={t("notes.newList")}
      onClose={onClose}
      className="small"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.title.trim()) onSubmit({ ...form, title: form.title.trim() });
      }}
    >
      <div className="modal-header">
        <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
        <h2>{t("notes.newList")}</h2>
        <button className="text-button primary" type="submit" disabled={!form.title.trim()}>{t("app.common.done")}</button>
      </div>
      <label className="emoji-field">
        <span style={{ backgroundColor: form.color }}>{form.icon || "•"}</span>
        <input aria-label={t("notes.emojiLabel")} maxLength={4} placeholder={t("notes.emojiPlaceholder")} value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} />
      </label>
      <input aria-label={t("notes.listTitleLabel")} autoFocus placeholder={t("notes.listTitlePlaceholder")} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
      <div className="swatches">
        {listColors.map((color) => (
          <button className={form.color === color ? "swatch active" : "swatch"} key={color} style={{ backgroundColor: color }} type="button" aria-label={color} onClick={() => setForm((current) => ({ ...current, color }))} />
        ))}
      </div>
    </Sheet>
  );
}

function filterNotes(notes: Note[], view: ViewId): Note[] {
  if (view === "today") return notes.filter((note) => !note.completed && note.reminders.some(isTodayReminder));
  if (view === "planned") return notes.filter((note) => !note.completed && note.reminders.length > 0);
  if (view === "completed") return notes.filter((note) => note.completed);
  if (view === "all") return notes.filter((note) => !note.completed);
  if (view === "inbox") return notes.filter((note) => !note.completed && !note.listId);
  return notes.filter((note) => !note.completed && note.listId === view.slice(5));
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function viewColor(view: ViewId, lists: ReminderList[]): string | undefined {
  if (view === "inbox") return INBOX_COLOR;
  if (view.startsWith("list:")) return lists.find((list) => list.id === view.slice(5))?.color;
  return undefined;
}

function getViewTitle(view: ViewId, lists: ReminderList[], t: Translate): string {
  if (view === "inbox") return t("notes.inbox");
  if (view.startsWith("list:")) return lists.find((list) => list.id === view.slice(5))?.title ?? t("notes.listFallback");
  return t(smartLists.find((list) => list.id === view)?.titleKey ?? "notes.listFallback");
}

function isTodayReminder(value: string): boolean {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function formatReminder(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
