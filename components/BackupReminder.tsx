"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import LocalBackupDialog from "@/components/LocalBackupDialog";
import { useUserContext } from "@/components/UserProvider";
import { BACKUP_REMINDER_SNOOZE_KEY, LAST_BACKUP_KEY, shouldRemindBackup } from "@/lib/localBackupFormat";

type BackupReminderProps = {
  /** Records already loaded by the screen; no extra reads are made. */
  records: { createdAt?: string; updatedAt?: string }[];
};

const SNOOZE_DAYS = 14;

/** A quiet, dismissible line that suggests saving a copy of on-device data. */
export default function BackupReminder({ records }: BackupReminderProps) {
  const { t } = useUserContext();
  const [stored, setStored] = useState<{ lastBackupAt: number | null; snoozedUntil: number | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setStored({ lastBackupAt: readNumber(LAST_BACKUP_KEY), snoozedUntil: readNumber(BACKUP_REMINDER_SNOOZE_KEY) });
  }, [dialogOpen]);

  const visible = useMemo(() => {
    if (!stored) return false;
    const createdTimes = records.map((record) => Date.parse(record.createdAt ?? "")).filter(Number.isFinite);
    const updatedTimes = records.map((record) => Date.parse(record.updatedAt ?? record.createdAt ?? "")).filter(Number.isFinite);
    return shouldRemindBackup({
      now: Date.now(),
      oldestRecordAt: createdTimes.length ? Math.min(...createdTimes) : null,
      newestRecordAt: updatedTimes.length ? Math.max(...updatedTimes) : null,
      ...stored
    });
  }, [records, stored]);

  function snooze() {
    const until = Date.now() + SNOOZE_DAYS * 86_400_000;
    try {
      window.localStorage.setItem(BACKUP_REMINDER_SNOOZE_KEY, String(until));
    } catch {
      // Without storage the line may come back next time.
    }
    setStored((current) => (current ? { ...current, snoozedUntil: until } : current));
  }

  return (
    <>
      {visible ? (
        <div className="backup-reminder" role="status">
          <span>{t("backup.reminder")}</span>
          <button className="text-button" type="button" onClick={() => setDialogOpen(true)}>{t("backup.save")}</button>
          <button className="backup-reminder-close" type="button" aria-label={t("app.common.close")} onClick={snooze}><X size={16} /></button>
        </div>
      ) : null}
      {dialogOpen ? <LocalBackupDialog onClose={() => setDialogOpen(false)} /> : null}
    </>
  );
}

function readNumber(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
