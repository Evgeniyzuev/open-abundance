"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteList,
  deleteNote,
  closeReflection,
  getLists,
  getNotes,
  Note,
  ReminderList,
  saveList,
  saveNote,
  saveReflectionCapture,
  toggleNoteCompleted
} from "@/lib/notesStore";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import ReflectionProcessor from "@/components/ReflectionProcessor";
import type { ReflectionTaskDraft } from "@/lib/reflections";
import { trackProductEvent } from "@/lib/productAnalytics";
import {
  enableReflectionPush,
  getReflectionReminderSettings,
  saveReflectionReminderSettings,
  syncInboxReviewReminder
} from "@/lib/pushReminders";

type ConnectionState = "online" | "offline";
type ViewId = "process" | "today" | "planned" | "all" | "completed" | `list:${string}`;
type ModalMode = "create" | "edit";

type SmartList = {
  id: ViewId;
  titleKey: MessageKey;
  icon: string;
  tone: string;
};

const smartLists: SmartList[] = [
  { id: "process", titleKey: "reflections.inbox", icon: "◌", tone: "purple" },
  { id: "today", titleKey: "notes.smart.today", icon: "🗓", tone: "blue" },
  { id: "planned", titleKey: "notes.smart.planned", icon: "📋", tone: "red" },
  { id: "all", titleKey: "notes.smart.all", icon: "📥", tone: "black" },
  { id: "completed", titleKey: "notes.smart.completed", icon: "✔️", tone: "gray" }
];

const listColors = ["#ff9500", "#007aff", "#34c759", "#ff3b30", "#af52de", "#8e8e93"];

function getDefaultReminderDraft(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

const emptyNoteForm = {
  title: "",
  body: "",
  listId: "",
  reminderDraft: getDefaultReminderDraft(),
  reminders: [] as string[]
};

const emptyListForm = {
  title: "",
  icon: "↗️",
  color: "#007aff"
};

type NotesAppProps = {
  onScheduleReflection: (draft: ReflectionTaskDraft) => void;
};

export default function NotesApp({ onScheduleReflection }: NotesAppProps) {
  const { locale, t } = useUserContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [listForm, setListForm] = useState(emptyListForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<ViewId | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [infoNoteId, setInfoNoteId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [quickCapture, setQuickCapture] = useState("");
  const [capturedNoteId, setCapturedNoteId] = useState<string | null>(null);
  const [processingNoteId, setProcessingNoteId] = useState<string | null>(null);
  const [reminderSettings, setReminderSettings] = useState(getReflectionReminderSettings);
  const [showReminderSetup, setShowReminderSetup] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reflectionInbox") === "1") {
      setDetailView("process");
    }
  }, []);

  const activeView = detailView ?? "all";
  const activeTitle = getViewTitle(activeView, lists, t);
  const activeNote = infoNoteId ? notes.find((note) => note.id === infoNoteId) : undefined;
  const processingNote = processingNoteId ? notes.find((note) => note.id === processingNoteId) : undefined;

  const visibleNotes = useMemo(() => {
    const source = notes.filter((note) => !note.deleted);
    return filterNotes(source, activeView).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [activeView, notes]);

  const refreshData = useCallback(async () => {
    const [storedNotes, storedLists] = await Promise.all([getNotes(), getLists()]);
    setNotes(storedNotes);
    setLists(storedLists);
    setNoteForm((current) => {
      if (!current.listId || storedLists.some((list) => list.id === current.listId)) {
        return current;
      }
      return { ...current, listId: "" };
    });
  }, []);

  useEffect(() => {
    setConnection(navigator.onLine ? "online" : "offline");
    refreshData();

    const handleOnline = () => setConnection("online");
    const handleOffline = () => setConnection("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshData]);

  const reflectionInboxCount = notes.filter((note) => !note.deleted && note.kind === "reflection" && note.processing?.status !== "closed").length;

  useEffect(() => {
    if (!reminderSettings.configured || !reminderSettings.enabled) return;
    void syncInboxReviewReminder(reflectionInboxCount > 0, locale, reminderSettings).catch(() => undefined);
  }, [locale, reflectionInboxCount, reminderSettings]);

  useEffect(() => {
    if (!capturedNoteId) return;
    const timeoutId = window.setTimeout(() => setCapturedNoteId(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [capturedNoteId]);

  function openList(view: ViewId) {
    setDetailView(view);
    if (view.startsWith("list:")) {
      setNoteForm((current) => ({ ...current, listId: view.slice(5) }));
    }
  }

  function openCreateNote() {
    const listId = detailView?.startsWith("list:") ? detailView.slice(5) : "";
    setEditingId(null);
    setNoteForm({ ...emptyNoteForm, listId });
    setNoteModalOpen(true);
  }

  function openEditNote(note: Note) {
    setEditingId(note.id);
    setNoteForm({
      title: note.title,
      body: note.body,
      listId: note.listId || "",
      reminderDraft: "",
      reminders: note.reminders || []
    });
    setInfoNoteId(null);
    setNoteModalOpen(true);
  }

  function closeNoteModal() {
    setNoteModalOpen(false);
    setEditingId(null);
    setNoteForm(emptyNoteForm);
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = noteForm.title.trim();
    const body = noteForm.body.trim();
    if (!title && !body) return;

    await saveNote({
      id: editingId ?? crypto.randomUUID(),
      title: title || t("notes.untitled"),
      body,
      listId: noteForm.listId || undefined,
      reminders: noteForm.reminders,
      syncStatus: "local"
    });

    closeNoteModal();
    await refreshData();
  }

  async function handleQuickCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = quickCapture.trim();
    if (!body) return;
    const captured = await saveReflectionCapture(body);
    setQuickCapture("");
    setCapturedNoteId(captured.id);
    if (!reminderSettings.configured) setShowReminderSetup(true);
    trackProductEvent("reflection_captured", { lengthBucket: getLengthBucket(body.length) });
    await refreshData();
  }

  async function enableDailyReviewReminder() {
    const enabled = await enableReflectionPush().catch(() => false);
    const next = { ...reminderSettings, enabled, configured: true };
    saveReflectionReminderSettings(next);
    setReminderSettings(next);
    setShowReminderSetup(false);
    if (enabled) await syncInboxReviewReminder(true, locale, next).catch(() => undefined);
  }

  function skipDailyReviewReminder() {
    const next = { ...reminderSettings, enabled: false, configured: true };
    saveReflectionReminderSettings(next);
    setReminderSettings(next);
    setShowReminderSetup(false);
  }

  async function handleListSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = listForm.title.trim();
    if (!title) return;

    const id = crypto.randomUUID();
    await saveList({
      id,
      title,
      icon: listForm.icon.trim() || "•",
      color: listForm.color,
      syncStatus: "local"
    });

    setListForm(emptyListForm);
    setListModalOpen(false);
    setDetailView(`list:${id}`);
    await refreshData();
  }

  function addReminder() {
    if (!noteForm.reminderDraft) return;
    setNoteForm((current) => ({
      ...current,
      reminderDraft: "",
      reminders: [...new Set([...current.reminders, new Date(current.reminderDraft).toISOString()])].sort()
    }));
  }

  function removeReminder(value: string) {
    setNoteForm((current) => ({
      ...current,
      reminders: current.reminders.filter((reminder) => reminder !== value)
    }));
  }

  async function removeNote(note: Note) {
    await deleteNote(note.id);
    setInfoNoteId(null);
    await refreshData();
  }

  async function completeNote(note: Note) {
    if (note.kind === "reflection") await closeReflection(note.id);
    else await toggleNoteCompleted(note.id);
    await refreshData();
  }

  async function removeListConfirmed(list: ReminderList) {
    const confirmed = window.confirm(t("notes.deleteListConfirm", { title: list.title }));
    if (!confirmed) return;
    await deleteList(list.id);
    setDetailView(null);
    await refreshData();
  }

  return (
    <section className="reminders-app">
      {detailView ? (
        <ListDetail
          activeTitle={activeTitle}
          locale={locale}
          notes={visibleNotes}
          lists={lists}
          onBack={() => setDetailView(null)}
          onCreate={openCreateNote}
          onCreateList={() => setListModalOpen(true)}
          onComplete={completeNote}
          onEdit={openEditNote}
          onInfo={setInfoNoteId}
          onOpenReflection={(note) => setProcessingNoteId(note.id)}
          isReflectionQueue={activeView === "process"}
          reminderSettings={reminderSettings}
          showReminderSetup={showReminderSetup}
          onReviewTimeChange={(reviewTime) => setReminderSettings((current) => ({ ...current, reviewTime }))}
          onEnableReminder={() => void enableDailyReviewReminder()}
          onSkipReminder={skipDailyReviewReminder}
          onShowReminderSetup={() => setShowReminderSetup(true)}
        />
      ) : (
        <HomeScreen
          connection={connection}
          locale={locale}
          lists={lists}
          notes={notes}
          onCreateList={() => setListModalOpen(true)}
          onCreateNote={openCreateNote}
          onDeleteList={removeListConfirmed}
          onOpenList={openList}
          captured={Boolean(capturedNoteId)}
          onCapture={handleQuickCapture}
          quickCapture={quickCapture}
          setQuickCapture={setQuickCapture}
        />
      )}

      {noteModalOpen ? (
        <NoteModal
          mode={editingId ? "edit" : "create"}
          form={noteForm}
          lists={lists}
          locale={locale}
          onAddReminder={addReminder}
          onClose={closeNoteModal}
          onRemoveReminder={removeReminder}
          onSubmit={handleNoteSubmit}
          setForm={setNoteForm}
        />
      ) : null}

      {listModalOpen ? (
        <ListModal
          form={listForm}
          onClose={() => setListModalOpen(false)}
          onSubmit={handleListSubmit}
          setForm={setListForm}
        />
      ) : null}

      {activeNote ? (
        <InfoModal
          list={lists.find((item) => item.id === activeNote.listId)}
          locale={locale}
          note={activeNote}
          onClose={() => setInfoNoteId(null)}
          onDelete={() => removeNote(activeNote)}
          onEdit={() => openEditNote(activeNote)}
        />
      ) : null}

      {processingNote?.processing ? (
        <ReflectionProcessor
          note={processingNote}
          onClose={() => setProcessingNoteId(null)}
          onRefresh={refreshData}
          onSchedule={(draft) => {
            setProcessingNoteId(null);
            onScheduleReflection(draft);
          }}
        />
      ) : null}
    </section>
  );
}

type HomeScreenProps = {
  connection: ConnectionState;
  locale: AppLocale;
  lists: ReminderList[];
  notes: Note[];
  onCreateList: () => void;
  onCreateNote: () => void;
  onDeleteList: (list: ReminderList) => void;
  onOpenList: (view: ViewId) => void;
  captured: boolean;
  onCapture: (event: FormEvent<HTMLFormElement>) => void;
  quickCapture: string;
  setQuickCapture: (value: string) => void;
};

function HomeScreen({ connection, lists, notes, onCreateList, onCreateNote, onDeleteList, onOpenList, captured, onCapture, quickCapture, setQuickCapture }: HomeScreenProps) {
  const { t } = useUserContext();
  const captureRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!quickCapture && captureRef.current) captureRef.current.style.height = "";
  }, [quickCapture]);

  return (
    <>
      <header className="home-topbar">
        <div className="status-line">
          <span className={`dot ${connection}`} />
          <span>{connection}</span>
          <span>local</span>
        </div>
        <div className="top-actions">
          <button className="round-button search-button" type="button" aria-label={t("app.common.search")}>⌕</button>
          <button className="round-button list-create-button" type="button" aria-label={t("notes.createList")} onClick={onCreateList}>▦</button>
          <button className="round-button primary-add-button" type="button" aria-label={t("notes.createNote")} onClick={onCreateNote}>+</button>
        </div>
      </header>

      <form className="reflection-capture" onSubmit={onCapture}>
        <textarea
          ref={captureRef}
          aria-label={t("reflections.captureLabel")}
          placeholder={t("reflections.capturePlaceholder")}
          rows={1}
          value={quickCapture}
          onChange={(event) => setQuickCapture(event.target.value)}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 76)}px`;
          }}
        />
        <button className="reflection-capture-button" type="submit" disabled={!quickCapture.trim()}>{t("reflections.capture")}</button>
      </form>
      {captured ? (
        <div className="reflection-capture-toast" role="status">{t("reflections.savedShort")}</div>
      ) : null}

      <div className="smart-grid compact">
        {smartLists.map((list) => (
          <button key={list.id} className={`smart-card ${list.tone}`} type="button" onClick={() => onOpenList(list.id)}>
            <span className="smart-icon">{list.icon}</span>
            <strong>{getSmartCount(list.id, notes)}</strong>
            <span>{t(list.titleKey)}</span>
          </button>
        ))}
      </div>

      <section className="my-lists-section">
        <h1>{t("notes.myLists")}</h1>
        <div className="ios-list-card">
          {lists.map((list) => (
            <div className="ios-list-row" key={list.id}>
              <button type="button" onClick={() => onOpenList(`list:${list.id}`)}>
                <span className="list-icon" style={{ backgroundColor: list.color }}>{list.icon}</span>
                <span>{list.title}</span>
                <strong>{getListCount(list.id, notes)}</strong>
                <span className="chevron">›</span>
              </button>
              <button className="row-delete" type="button" aria-label={t("notes.deleteListLabel", { title: list.title })} onClick={() => onDeleteList(list)}>×</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

type ListDetailProps = {
  activeTitle: string;
  locale: AppLocale;
  notes: Note[];
  lists: ReminderList[];
  onBack: () => void;
  onCreate: () => void;
  onCreateList: () => void;
  onComplete: (note: Note) => void;
  onEdit: (note: Note) => void;
  onInfo: (id: string) => void;
  onOpenReflection: (note: Note) => void;
  isReflectionQueue: boolean;
  reminderSettings: ReturnType<typeof getReflectionReminderSettings>;
  showReminderSetup: boolean;
  onReviewTimeChange: (value: string) => void;
  onEnableReminder: () => void;
  onSkipReminder: () => void;
  onShowReminderSetup: () => void;
};

function ListDetail({ activeTitle, locale, notes, lists, onBack, onCreate, onCreateList, onComplete, onEdit, onInfo, onOpenReflection, isReflectionQueue, reminderSettings, showReminderSetup, onReviewTimeChange, onEnableReminder, onSkipReminder, onShowReminderSetup }: ListDetailProps) {
  const { t } = useUserContext();
  const showReminderControls = isReflectionQueue && (notes.length > 0 || reminderSettings.configured);
  const showReminderForm = isReflectionQueue && (showReminderSetup || (notes.length > 0 && !reminderSettings.configured));

  return (
    <section className="detail-screen">
      <header className="detail-topbar">
        <button className="back-button" type="button" onClick={onBack}>‹</button>
        <h1>{activeTitle}</h1>
        {isReflectionQueue ? (
          <span className="reflection-queue-count">{notes.length}</span>
        ) : (
          <div className="top-actions">
            <button className="round-button search-button" type="button" aria-label={t("app.common.search")}>⌕</button>
            <button className="round-button list-create-button" type="button" aria-label={t("notes.createList")} onClick={onCreateList}>▦</button>
            <button className="round-button primary-add-button" type="button" aria-label={t("notes.createNote")} onClick={onCreate}>+</button>
          </div>
        )}
      </header>

      {isReflectionQueue && notes.length > 0 ? <p className="reflection-queue-hint">{t("reflections.returnLater")}</p> : null}
      {showReminderControls ? (
        <section className="reflection-queue-reminder">
          <div className="reflection-queue-reminder-summary">
            <span>{t("reflections.queueCount", { count: notes.length })}</span>
            {reminderSettings.enabled ? (
              <button className="text-button" type="button" onClick={onShowReminderSetup}>{t("reflections.dailyAt", { time: reminderSettings.reviewTime })}</button>
            ) : !showReminderForm ? (
              <button className="text-button" type="button" onClick={onShowReminderSetup}>{t("reflections.enableReminder")}</button>
            ) : null}
          </div>
          {showReminderForm ? (
            <div className="reflection-reminder-setup">
              <span>{t("reflections.reviewReminderPrompt")}</span>
              <input aria-label={t("reflections.reviewTime")} type="time" value={reminderSettings.reviewTime} onChange={(event) => onReviewTimeChange(event.target.value)} />
              <button className="secondary-button" type="button" onClick={onEnableReminder}>{t("reflections.enableReminder")}</button>
              <button className="text-button" type="button" onClick={onSkipReminder}>{t("reflections.notNow")}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="task-list compact-list">
        {notes.length === 0 ? (
          <div className="empty-state">{t(isReflectionQueue ? "reflections.inboxEmpty" : "notes.emptyList")}</div>
        ) : (
          notes.map((note) => {
            const list = lists.find((item) => item.id === note.listId);
            return (
              <article className={`task-row ${note.completed ? "completed" : ""}`} key={note.id}>
                <button className="complete-toggle" type="button" aria-label={t("notes.complete")} onClick={() => onComplete(note)}>{note.completed ? "\u2713" : ""}</button>
                <button className="task-text" type="button" onClick={() => note.kind === "reflection" ? onOpenReflection(note) : onEdit(note)}>
                  <span>{note.title}</span>
                  {note.body ? <small>{note.body}</small> : null}
                  {note.kind === "reflection" && note.processing ? <i>{getReflectionStatusLabel(note.processing.status, t)}</i> : null}
                  {isReflectionQueue && note.kind === "reflection" ? <strong className="reflection-row-action">{t(note.processing?.status === "inbox" ? "reflections.processNow" : "reflections.openProcessing")}</strong> : null}
                  {note.reminders.length > 0 ? <em>{note.reminders.map((reminder) => formatReminder(reminder, locale)).join(" · ")}</em> : null}
                  {list ? <i>{list.icon} {list.title}</i> : null}
                </button>
                <button className="info-button" type="button" aria-label={t("app.common.info")} onClick={() => onInfo(note.id)}>i</button>
              </article>
            );
          })
        )}
      </div>

    </section>
  );
}

type NoteModalProps = {
  mode: ModalMode;
  form: typeof emptyNoteForm;
  locale: AppLocale;
  lists: ReminderList[];
  onAddReminder: () => void;
  onClose: () => void;
  onRemoveReminder: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyNoteForm>>;
};

function NoteModal({ mode, form, locale, lists, onAddReminder, onClose, onRemoveReminder, onSubmit, setForm }: NoteModalProps) {
  const { t } = useUserContext();

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet" onSubmit={onSubmit}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{mode === "edit" ? t("notes.note") : t("notes.newNote")}</h2>
          <button className="text-button primary" type="submit">{t("app.common.done")}</button>
        </div>
        <input aria-label={t("notes.titleLabel")} autoFocus placeholder={t("notes.titlePlaceholder")} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <textarea aria-label={t("notes.bodyLabel")} placeholder={t("notes.bodyPlaceholder")} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
        <select value={form.listId} onChange={(event) => setForm((current) => ({ ...current, listId: event.target.value }))}>
          <option value="">-- {t("notes.noList")}</option>
          {lists.map((list) => <option key={list.id} value={list.id}>{list.icon} {list.title}</option>)}
        </select>
        <div className="date-row">
          <input type="datetime-local" value={form.reminderDraft} onChange={(event) => setForm((current) => ({ ...current, reminderDraft: event.target.value }))} />
          <button className="secondary-button" type="button" onClick={onAddReminder}>{t("notes.addDate")}</button>
        </div>
        {form.reminders.length > 0 ? (
          <div className="chips">
            {form.reminders.map((reminder) => (
              <button className="chip" key={reminder} type="button" onClick={() => onRemoveReminder(reminder)}>{formatReminder(reminder, locale)} x</button>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}

type ListModalProps = {
  form: typeof emptyListForm;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyListForm>>;
};

function ListModal({ form, onClose, onSubmit, setForm }: ListModalProps) {
  const { t } = useUserContext();

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet small" onSubmit={onSubmit}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("notes.newList")}</h2>
          <button className="text-button primary" type="submit">{t("app.common.done")}</button>
        </div>
        <label className="emoji-field">
          <span style={{ backgroundColor: form.color }}>{form.icon || "•"}</span>
          <input aria-label={t("notes.emojiLabel")} maxLength={4} placeholder={t("notes.emojiPlaceholder")} value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} />
        </label>
        <input aria-label={t("notes.listTitleLabel")} autoFocus placeholder={t("notes.listTitlePlaceholder")} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        <div className="swatches">
          {listColors.map((color) => (
            <button className={form.color === color ? "swatch active" : "swatch"} key={color} style={{ backgroundColor: color }} type="button" onClick={() => setForm((current) => ({ ...current, color }))} />
          ))}
        </div>
      </form>
    </div>
  );
}

type InfoModalProps = {
  list?: ReminderList;
  locale: AppLocale;
  note: Note;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
};

function InfoModal({ list, locale, note, onClose, onDelete, onEdit }: InfoModalProps) {
  const { t } = useUserContext();

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet small">
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.close")}</button>
          <h2>{t("app.common.info")}</h2>
          <span />
        </div>
        <div className="info-block">
          <strong>{note.title}</strong>
          {note.body ? <p>{note.body}</p> : null}
          <span>{list ? `${list.icon} ${list.title}` : t("notes.noList")}</span>
          <span>{note.syncStatus}</span>
          {note.reminders.map((reminder) => <span key={reminder}>{formatReminder(reminder, locale)}</span>)}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onEdit}>{t("app.common.edit")}</button>
          <button className="danger-button" type="button" onClick={onDelete}>{t("app.common.delete")}</button>
        </div>
      </div>
    </div>
  );
}

function filterNotes(notes: Note[], view: ViewId): Note[] {
  if (view === "process") return notes.filter((note) => note.kind === "reflection" && note.processing?.status !== "closed");
  if (view === "today") return notes.filter((note) => !note.completed && note.reminders.some(isTodayReminder));
  if (view === "planned") return notes.filter((note) => !note.completed && note.reminders.length > 0);
  if (view === "completed") return notes.filter((note) => note.completed);
  if (view === "all") return notes.filter((note) => !note.completed);
  if (view.startsWith("list:")) return notes.filter((note) => !note.completed && note.listId === view.slice(5));
  return notes;
}

function getSmartCount(view: ViewId, notes: Note[]): number {
  return filterNotes(notes.filter((note) => !note.deleted), view).length;
}

function getListCount(listId: string, notes: Note[]): number {
  return notes.filter((note) => !note.deleted && !note.completed && note.listId === listId).length;
}

function getViewTitle(view: ViewId, lists: ReminderList[], t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  if (view === "process") return t("reflections.inbox");
  if (view === "today") return t("notes.smart.today");
  if (view === "planned") return t("notes.smart.planned");
  if (view === "all") return t("notes.smart.all");
  if (view === "completed") return t("notes.smart.completed");
  if (view.startsWith("list:")) return lists.find((list) => list.id === view.slice(5))?.title ?? t("notes.listFallback");
  return t("notes.listFallback");
}

function getReflectionStatusLabel(status: NonNullable<Note["processing"]>["status"], t: (key: MessageKey) => string): string {
  if (status === "clarifying") return t("reflections.status.clarifying");
  if (status === "ready") return t("reflections.status.ready");
  if (status === "planned") return t("reflections.status.planned");
  if (status === "waiting") return t("reflections.status.waiting");
  if (status === "closed") return t("reflections.status.closed");
  return t("reflections.status.inbox");
}

function getLengthBucket(length: number): string {
  if (length < 120) return "short";
  if (length < 500) return "medium";
  return "long";
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
