"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Eye, EyeOff, Inbox, ListPlus, MoreHorizontal, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import {
  ABUNDANCE_LIST_ID,
  deleteList,
  deleteNote,
  getLists,
  getNotes,
  Note,
  ReminderList,
  saveList,
  saveNote,
  setNoteAiReview,
  toggleNoteCompleted,
  NOTES_CHANGED_EVENT
} from "@/lib/notesStore";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import BackupReminder from "@/components/BackupReminder";
import NotesImport from "@/components/NotesImport";
import LocalDataNotice from "@/components/LocalDataNotice";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import { takeQuickAction } from "@/lib/quickAction";
import { useEdgeSwipeBack, useHistoryLayer } from "@/lib/historyLayer";
import { NoteAiAnswer, NoteAiBadge, NoteAiMenu } from "@/components/NoteAiPanel";
import { flushAbundanceNotes, pullNoteAiAnswers, requestNoteAiReview, syncAbundanceNote, type NoteAiRequestFailure } from "@/lib/noteAiClient";
import { saveTask } from "@/lib/tasksStore";
import { todayKey } from "@/lib/taskSchedule";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type LocalDataStatus = "loading" | "slow" | "ready" | "error";
/**
 * Built-in lists cannot be deleted, only hidden: "inbox" holds every note without a list of its own,
 * "abundance" holds thoughts and ideas the team and AI read (its notes are also saved on the server).
 */
type BuiltInListId = "inbox" | "abundance";
type ViewId = "today" | "planned" | "all" | "completed" | BuiltInListId | `list:${string}`;
type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

type SmartList = {
  id: Exclude<ViewId, BuiltInListId | `list:${string}`>;
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
const ABUNDANCE_COLOR = "#ff9f0a";
const HIDDEN_LISTS_KEY = "openAbundanceHiddenNoteLists";
const ABUNDANCE_INTRO_KEY = "openAbundanceAbundanceIntroSeen";
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
  const [toast, setToast] = useState<string | null>(null);
  const [aiMenuNote, setAiMenuNote] = useState<Note | null>(null);
  const [hiddenLists, setHiddenLists] = useState<BuiltInListId[]>([]);
  const [aboutAbundance, setAboutAbundance] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [localDataStatus, setLocalDataStatus] = useState<LocalDataStatus>("loading");
  const localLoadRequestRef = useRef(0);
  // An open list and search are history layers, like the note page: Back returns to My lists, not to another tab.
  const closeView = useHistoryLayer(view !== null, () => setView(null));
  const closeSearch = useHistoryLayer(searchOpen, () => { setSearchOpen(false); setQuery(""); });
  const listSwipe = useEdgeSwipeBack(closeView);
  const searchSwipe = useEdgeSwipeBack(closeSearch);

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
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    setHiddenLists(readHiddenLists());
    // AI answers that came while the app was closed, and Abundance notes that could not be sent yet.
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void pullNoteAiAnswers().catch(() => 0);
      void flushAbundanceNotes().catch(() => undefined);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    // The first visit to Abundance explains who reads these notes.
    if (view !== "abundance") return;
    try {
      if (window.localStorage.getItem(ABUNDANCE_INTRO_KEY)) return;
      window.localStorage.setItem(ABUNDANCE_INTRO_KEY, "1");
    } catch {
      // Without storage the description stays one tap away behind (?).
      return;
    }
    setAboutAbundance(true);
  }, [view]);

  const visibleNotes = useMemo(() => (view ? sortNotes(filterNotes(notes, view)) : []), [notes, view]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return sortNotes(notes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(needle)));
  }, [notes, query]);

  function openNewNote() {
    const listId = view === "abundance" ? ABUNDANCE_LIST_ID : view?.startsWith("list:") ? view.slice(5) : undefined;
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

  function toggleHidden(id: BuiltInListId) {
    setHiddenLists((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        window.localStorage.setItem(HIDDEN_LISTS_KEY, JSON.stringify(next));
      } catch {
        // Hiding then lasts until the screen is reopened.
      }
      return next;
    });
  }

  /** The AI button: ⏳ only reminds that the answer is coming, ✨ opens the answer, otherwise the choice of review. */
  function onAi(note: Note) {
    if (note.aiReview?.status === "pending") setToast(t("notes.ai.queued"));
    else if (note.aiReview?.status === "ready" && !note.aiReview.seen) setNoteTarget({ id: note.id, isNew: false });
    else setAiMenuNote(note);
  }

  async function removeList(list: ReminderList) {
    if (!window.confirm(t("notes.deleteListConfirm", { title: list.title }))) return;
    await deleteList(list.id);
    if (view === `list:${list.id}`) setView(null);
    await refreshData();
  }

  const activeList = view?.startsWith("list:") ? lists.find((list) => list.id === view.slice(5)) : undefined;
  // A new note becomes a stored one once saved (for example before an AI review), so look it up either way.
  const editingNote = noteTarget ? notes.find((note) => note.id === noteTarget.id) : undefined;
  const abundanceList = useMemo<ReminderList>(() => ({
    id: ABUNDANCE_LIST_ID, title: t("notes.abundance.title"), icon: "✨", color: ABUNDANCE_COLOR, createdAt: "", updatedAt: "", syncStatus: "synced"
  }), [t]);
  const rowLists = useMemo(() => [abundanceList, ...lists], [abundanceList, lists]);
  const builtIns: Array<{ id: BuiltInListId; color: string; icon: React.ReactNode; title: string }> = [
    { id: "inbox", color: INBOX_COLOR, icon: <Inbox size={19} aria-hidden="true" />, title: t("notes.inbox") },
    { id: "abundance", color: ABUNDANCE_COLOR, icon: <Sparkles size={19} aria-hidden="true" />, title: abundanceList.title }
  ];

  return (
    <section className="reminders-app notes-ios">
      <LocalDataNotice status={localDataStatus} onRetry={() => void loadLocalData()} />
      {localDataStatus === "ready" ? <BackupReminder records={notes} /> : null}

      {searchOpen ? (
        <div className="notes-search-screen" {...searchSwipe}>
          <div className="notes-search-bar">
            <label>
              <Search size={18} aria-hidden="true" />
              <input autoFocus type="search" aria-label={t("app.common.search")} placeholder={t("app.common.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button className="text-button" type="button" onClick={closeSearch}>{t("app.common.cancel")}</button>
          </div>
          {query.trim() ? (
            <NoteRows notes={searchResults} lists={rowLists} locale={locale} emptyKey="notes.searchEmpty" onComplete={completeNote} onOpen={(note) => setNoteTarget({ id: note.id, isNew: false })} onAi={onAi} />
          ) : null}
        </div>
      ) : view ? (
        <section className="notes-list-screen" {...listSwipe}>
          <header className="notes-list-topbar">
            <button className="notes-back" type="button" onClick={closeView}>
              <ChevronLeft size={24} aria-hidden="true" />
              <span>{t("notes.lists")}</span>
            </button>
            {activeList ? (
              <button className="notes-icon-button" type="button" aria-label={t("notes.deleteListLabel", { title: activeList.title })} onClick={() => void removeList(activeList)}>
                <Trash2 size={19} aria-hidden="true" />
              </button>
            ) : null}
          </header>
          <div className="notes-list-heading">
            <h1 className="notes-list-title" style={{ color: viewColor(view, lists) }}>{getViewTitle(view, lists, t)}</h1>
            {view === "abundance" ? (
              <button className="notes-icon-button" type="button" aria-label={t("notes.abundance.about")} onClick={() => setAboutAbundance(true)}>
                <CircleHelp size={20} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <NoteRows notes={visibleNotes} lists={view.startsWith("list:") || view === "inbox" || view === "abundance" ? [] : rowLists} locale={locale} emptyKey="notes.emptyList" onComplete={completeNote} onOpen={(note) => setNoteTarget({ id: note.id, isNew: false })} onAi={onAi} />
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
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setImportOpen(true); }}>{t("notes.import.menu")}</button>
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
              {builtIns.filter((item) => editingLists || !hiddenLists.includes(item.id)).map((item) => (
                <ListRow
                  key={item.id}
                  color={item.color}
                  icon={item.icon}
                  title={item.title}
                  count={filterNotes(notes, item.id).length}
                  onOpen={() => setView(item.id)}
                  hidden={hiddenLists.includes(item.id)}
                  onToggleHidden={editingLists ? () => toggleHidden(item.id) : undefined}
                  toggleLabel={t(hiddenLists.includes(item.id) ? "notes.showList" : "notes.hideList", { title: item.title })}
                />
              ))}
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

      {toast ? <div className="notes-toast" role="status">{toast}</div> : null}

      {noteTarget && (noteTarget.isNew || editingNote) ? (
        <NoteDetail
          key={noteTarget.id}
          note={editingNote}
          target={noteTarget}
          lists={lists}
          abundanceTitle={abundanceList.title}
          locale={locale}
          onAi={setAiMenuNote}
          onClose={async () => { setNoteTarget(null); await refreshData(); }}
        />
      ) : null}

      {aiMenuNote ? (
        <NoteAiMenu
          note={aiMenuNote}
          listTitles={[t("notes.inbox"), abundanceList.title, ...lists.map((list) => list.title)]}
          onClose={() => setAiMenuNote(null)}
          onQueued={(message) => { setAiMenuNote(null); setToast(message); }}
          onChat={() => { setAiMenuNote(null); setNoteTarget(null); }}
        />
      ) : null}

      {importOpen ? (
        <NotesImport
          onClose={() => setImportOpen(false)}
          onDone={(count) => { setImportOpen(false); setToast(t("notes.import.done", { count })); void refreshData(); }}
        />
      ) : null}

      {aboutAbundance ? (
        <Sheet bare className="small notes-about" ariaLabel={abundanceList.title} closeLabel={t("app.common.close")} onClose={() => setAboutAbundance(false)}>
          <h2><Sparkles size={20} aria-hidden="true" /> {abundanceList.title}</h2>
          <p>{t("notes.abundance.description")}</p>
          <p className="notes-about-note">{t("notes.abundance.privacy")}</p>
          <button className="notes-about-ok" type="button" onClick={() => setAboutAbundance(false)}>{t("notes.abundance.ok")}</button>
        </Sheet>
      ) : null}

      {listModalOpen ? <ListModal onClose={() => setListModalOpen(false)} onSubmit={(form) => void createList(form)} /> : null}
    </section>
  );
}

function ListRow({ color, icon, title, count, onOpen, onDelete, deleteLabel, hidden, onToggleHidden, toggleLabel }: {
  color: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  onOpen: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Built-in lists are hidden instead of deleted: an eye in place of the cross. */
  hidden?: boolean;
  onToggleHidden?: () => void;
  toggleLabel?: string;
}) {
  return (
    <div className={`notes-list-row${hidden ? " hidden-list" : ""}`}>
      {onDelete ? <button className="notes-row-delete" type="button" aria-label={deleteLabel} onClick={onDelete}><X size={14} aria-hidden="true" /></button> : null}
      {onToggleHidden ? (
        <button className="notes-row-eye" type="button" aria-label={toggleLabel} aria-pressed={!hidden} onClick={onToggleHidden}>
          {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
      ) : null}
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
  onAi: (note: Note) => void;
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
            <NoteAiBadge note={note} onClick={() => onAi(note)} />
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
function NoteDetail({ note, target, lists, abundanceTitle, locale, onAi, onClose }: {
  note?: Note;
  target: NoteTarget;
  lists: ReminderList[];
  abundanceTitle: string;
  locale: AppLocale;
  /** Opens the choice of AI review for the note as it is now (the draft is saved first). */
  onAi: (note: Note) => void;
  onClose: () => Promise<void>;
}) {
  const { t } = useUserContext();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [listId, setListId] = useState(note?.listId ?? target.listId ?? "");
  const [reminders, setReminders] = useState<string[]>(note?.reminders ?? []);
  const closingRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = bodyRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [body]);

  const review = note?.aiReview;
  const answerReady = review?.status === "ready" && !review.seen;
  useEffect(() => {
    // Opening the note is reading the answer: the ✨ on the row goes back to "AI".
    if (note && answerReady && review) void setNoteAiReview(note.id, { ...review, seen: true });
  }, [note, answerReady, review]);

  /** Saves the draft when it differs from the stored note; returns the stored note, or nothing for an empty new one. */
  async function saveDraft(): Promise<Note | undefined> {
    const nextTitle = title.trim();
    const nextBody = body.trim();
    const changed = !note || nextTitle !== note.title || nextBody !== note.body || (listId || undefined) !== note.listId || reminders.join() !== note.reminders.join();
    if (!(nextTitle || nextBody) || !changed) return note;
    const saved = await saveNote({
      id: target.id,
      title: nextTitle || nextBody.split("\n")[0].slice(0, 80) || t("notes.untitled"),
      body: nextBody,
      listId: listId || undefined,
      reminders,
      syncStatus: "local"
    });
    void syncAbundanceNote(saved, note?.listId);
    return saved;
  }

  async function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    await saveDraft();
    await onClose();
  }

  async function remove() {
    closingRef.current = true;
    if (note) {
      await deleteNote(note.id);
      void syncAbundanceNote({ ...note, deleted: true }, note.listId);
    }
    await onClose();
  }

  async function openAi() {
    const saved = await saveDraft();
    if (saved) onAi(saved);
    else bodyRef.current?.focus();
  }

  /** The same review again, with the person's clarification. */
  async function reviewAgain(addition: string): Promise<NoteAiRequestFailure | null> {
    const saved = await saveDraft();
    const previous = saved?.aiReview;
    if (!saved || !previous) return "error";
    const listTitles = [t("notes.inbox"), abundanceTitle, ...lists.map((list) => list.title)];
    const outcome = await requestNoteAiReview({ note: saved, mode: previous.mode, action: previous.action, locale, listTitles, addition });
    return outcome.ok ? null : outcome.reason;
  }

  async function createTasks(items: string[]) {
    for (const item of items) {
      await saveTask({ id: crypto.randomUUID(), title: item, description: "", schedule: { type: "once", date: todayKey() }, sourceNoteId: target.id, syncStatus: "local" });
    }
  }

  async function addWish() {
    const response = await fetchWithSupabaseAuth("/api/wishes", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: (title.trim() || body.trim()).slice(0, 120), description: body.trim(), locale, visibility: "private" })
    });
    if (!response.ok) throw new Error(`Wish was not added: ${response.status}`);
  }

  const suggestedList = review?.result?.list?.toLowerCase();
  const moveTarget = suggestedList
    ? [{ id: "", title: t("notes.inbox") }, { id: ABUNDANCE_LIST_ID, title: abundanceTitle }, ...lists]
      .find((list) => list.title.toLowerCase() === suggestedList && list.id !== listId)
    : undefined;

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
              <option value={ABUNDANCE_LIST_ID}>✨ {abundanceTitle}</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.icon} {list.title}</option>)}
            </select>
          </label>
          <ReminderPicker reminders={reminders} onChange={setReminders} />
        </div>

        {note?.aiReview ? (
          <NoteAiAnswer
            key={note.aiReview.requestId ?? note.aiReview.requestedAt}
            note={note}
            moveTarget={moveTarget ? { id: moveTarget.id, title: moveTarget.title } : undefined}
            onMove={setListId}
            onCreateTasks={createTasks}
            onAddWish={addWish}
            onAgain={() => void openAi()}
            onReviewAgain={reviewAgain}
          />
        ) : null}

        {note?.aiReview?.status !== "pending" ? (
          <button className="notes-detail-ai" type="button" onClick={() => void openAi()}>
            <Sparkles size={18} aria-hidden="true" />
            <span>{t("notes.aiAction")}</span>
          </button>
        ) : null}

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

/**
 * One reminder per note in one compact row: an empty date and an empty time. Tapping the date opens the
 * system picker already on today; a date alone gets a time by itself (9:00, or the next full hour today).
 */
function ReminderPicker({ reminders, onChange }: { reminders: string[]; onChange: (value: string[]) => void }) {
  const { t } = useUserContext();
  const current = reminders[0];
  const parts = current ? toLocalParts(current) : { date: "", time: "" };

  function apply(date: string, time: string) {
    if (!date) {
      onChange([]);
      return;
    }
    const value = new Date(`${date}T${time || defaultReminderTime(date)}`);
    if (!Number.isNaN(value.getTime())) onChange([value.toISOString()]);
  }

  return (
    <div className="notes-detail-field notes-reminder-row" role="group" aria-label={t("notes.reminder")}>
      <Bell size={20} aria-hidden="true" />
      <div className="notes-reminder-inputs">
        <input type="date" aria-label={t("notes.when.date")} value={parts.date} onChange={(event) => apply(event.target.value, parts.time)} />
        <input type="time" aria-label={t("notes.when.time")} value={parts.time} onChange={(event) => apply(parts.date || nextDateForTime(event.target.value), event.target.value)} />
        {current ? (
          <button className="notes-icon-button" type="button" aria-label={t("notes.when.clear")} onClick={() => onChange([])}><X size={16} aria-hidden="true" /></button>
        ) : null}
      </div>
    </div>
  );
}

/** 9:00, or for today the next full hour when 9:00 has passed. */
function defaultReminderTime(date: string, now = new Date()): string {
  if (date !== toLocalParts(now.toISOString()).date || now.getHours() < 9) return "09:00";
  return `${String(Math.min(now.getHours() + 1, 23)).padStart(2, "0")}:00`;
}

/** A time set first goes to today, or to tomorrow when that time has already passed. */
function nextDateForTime(time: string, now = new Date()): string {
  const value = new Date(now);
  const [hours, minutes] = time.split(":").map(Number);
  value.setHours(hours || 0, minutes || 0, 0, 0);
  if (value <= now) value.setDate(value.getDate() + 1);
  return toLocalParts(value.toISOString()).date;
}

function toLocalParts(iso: string): { date: string; time: string } {
  const value = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`
  };
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
        <label className={listColors.includes(form.color) ? "swatch swatch-custom" : "swatch swatch-custom active"} title={t("notes.customColor")}>
          <input type="color" aria-label={t("notes.customColor")} value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
          {listColors.includes(form.color) ? null : <span className="swatch-custom-dot" style={{ backgroundColor: form.color }} aria-hidden="true" />}
        </label>
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
  if (view === "abundance") return notes.filter((note) => !note.completed && note.listId === ABUNDANCE_LIST_ID);
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
  if (view === "abundance") return ABUNDANCE_COLOR;
  if (view.startsWith("list:")) return lists.find((list) => list.id === view.slice(5))?.color;
  return undefined;
}

function getViewTitle(view: ViewId, lists: ReminderList[], t: Translate): string {
  if (view === "inbox") return t("notes.inbox");
  if (view === "abundance") return t("notes.abundance.title");
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

function readHiddenLists(): BuiltInListId[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_LISTS_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is BuiltInListId => item === "inbox" || item === "abundance") : [];
  } catch {
    return [];
  }
}
