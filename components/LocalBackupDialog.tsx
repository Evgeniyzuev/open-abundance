"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { collectLocalBackup, importLocalBackup, markBackupSaved } from "@/lib/localBackup";
import { backupFileName, countBackup, MAX_BACKUP_FILE_BYTES, parseBackup, type BackupCounts, type LocalBackup } from "@/lib/localBackupFormat";
import { scheduleActionReminder } from "@/lib/pushReminders";
import { shareOrDownloadFile } from "@/lib/shareFile";

type LocalBackupDialogProps = {
  onClose: () => void;
};

type Notice = { tone: "ok" | "error"; text: string } | null;

/** Saves on-device notes, tasks and settings to a file and merges a file back. No server involved. */
export default function LocalBackupDialog({ onClose }: LocalBackupDialogProps) {
  const { locale, t, user } = useUserContext();
  const userId = user?.id ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [includeAi, setIncludeAi] = useState(false);
  const [counts, setCounts] = useState<BackupCounts | null>(null);
  const [pending, setPending] = useState<LocalBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    void collectLocalBackup({ includeAi: false, userId: null })
      .then((backup) => setCounts(countBackup(backup.stores)))
      .catch(() => setCounts(null));
  }, []);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const backup = await collectLocalBackup({ includeAi, userId });
      const file = new File([JSON.stringify(backup)], backupFileName(), { type: "application/json" });
      if (!(await shareOrDownloadFile(file))) return;
      markBackupSaved();
      setNotice({ tone: "ok", text: t("backup.saved") });
    } catch {
      setNotice({ tone: "error", text: t("backup.saveError") });
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file?: File) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setNotice(null);
    setPending(null);
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setNotice({ tone: "error", text: t("backup.tooLarge") });
      return;
    }
    try {
      const backup = parseBackup(JSON.parse(await file.text()));
      if (!backup) throw new Error("invalid_backup");
      setPending(backup);
    } catch {
      setNotice({ tone: "error", text: t("backup.invalid") });
    }
  }

  async function merge() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await importLocalBackup(pending, userId);
      for (const reminder of result.futureReminders) void scheduleActionReminder(reminder.id, reminder.remindAt, locale);
      setPending(null);
      setNotice({ tone: "ok", text: t("backup.done", { added: result.added, updated: result.updated, kept: result.kept }) });
      const fresh = await collectLocalBackup({ includeAi: false, userId: null });
      setCounts(countBackup(fresh.stores));
    } catch {
      setNotice({ tone: "error", text: t("backup.importError") });
    } finally {
      setBusy(false);
    }
  }

  const pendingCounts = pending ? countBackup(pending.stores) : null;

  return (
    <Sheet bare className="local-backup-dialog" titleId="local-backup-title" onClose={onClose}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><h2 id="local-backup-title">{t("backup.title")}</h2></div>
        <div className="local-backup-body">
          {counts ? <p>{t("backup.counts", { notes: counts.notes, tasks: counts.tasks, completions: counts.taskCompletions })}</p> : null}
          {userId ? (
            <label className="local-backup-check">
              <input type="checkbox" checked={includeAi} onChange={(event) => setIncludeAi(event.target.checked)} />
              <span>{t("backup.includeAi")}</span>
            </label>
          ) : null}
          <small>{t("backup.warning")}</small>
          <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void save()}><Download size={17} /> {t("backup.save")}</button>

          <button className="secondary-button" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> {t("backup.restore")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void readFile(event.target.files?.[0])} />

          {pending && pendingCounts ? (
            <div className="local-backup-preview">
              <p>{t("backup.preview", { notes: pendingCounts.notes, tasks: pendingCounts.tasks, completions: pendingCounts.taskCompletions })}</p>
              <small>{t("backup.mergeHint")}</small>
              <button className="challenge-primary-action" type="button" disabled={busy} onClick={() => void merge()}>{t("backup.merge")}</button>
            </div>
          ) : null}
          {notice ? <p className={notice.tone === "error" ? "local-backup-notice error" : "local-backup-notice"} role="status">{notice.text}</p> : null}
        </div>
    </Sheet>
  );
}
