"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale } from "@/lib/i18n";
import { getNotes } from "@/lib/notesStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import { shareOrDownloadFile } from "@/lib/shareFile";
import { todayKey } from "@/lib/taskSchedule";
import { getAllTasks, getTaskCompletions } from "@/lib/tasksStore";
import { computeWeekRecap, type WeekRecap } from "@/lib/weekRecap";

type WeekRecapModalProps = {
  onClose: () => void;
};

/** "My week": counts from on-device data, plus a shareable image with numbers only. */
export default function WeekRecapModal({ onClose }: WeekRecapModalProps) {
  const { locale, t } = useUserContext();
  const [recap, setRecap] = useState<WeekRecap | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    void Promise.all([getAllTasks(), getTaskCompletions(), getNotes()])
      .then(([tasks, completions, notes]) => setRecap(computeWeekRecap({ today: todayKey(), tasks, completions, notes })))
      .catch(() => setRecap(computeWeekRecap({ today: todayKey(), tasks: [], completions: [], notes: [] })));
    trackProductEvent("week_recap_opened");
  }, []);

  async function share() {
    if (!recap) return;
    setSharing(true);
    setShareError(false);
    try {
      const blob = await drawRecapImage(recap, locale, {
        title: t("weekRecap.imageTitle"),
        activeDays: t("weekRecap.activeDays"),
        checkIns: t("weekRecap.checkIns"),
        tasksFinished: t("weekRecap.tasksFinished"),
        notesWritten: t("weekRecap.notesWritten"),
        footer: "Open Abundance"
      });
      const shared = await shareOrDownloadFile(new File([blob], `open-abundance-week-${recap.days[6]}.png`, { type: "image/png" }));
      if (shared) trackProductEvent("week_recap_shared");
    } catch {
      setShareError(true);
    } finally {
      setSharing(false);
    }
  }

  const max = recap ? Math.max(1, ...recap.perDay) : 1;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet week-recap-modal" role="dialog" aria-modal="true" aria-labelledby="week-recap-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><h2 id="week-recap-title">{t("weekRecap.title")}</h2></div>
        {recap ? (
          <div className="week-recap-body">
            <div className="week-recap-bars" role="img" aria-label={t("weekRecap.barsLabel", { days: recap.activeDays })}>
              {recap.days.map((day, index) => (
                <span key={day}>
                  <i style={{ height: `${Math.max(6, (recap.perDay[index] / max) * 100)}%` }} className={recap.perDay[index] > 0 ? "active" : ""} />
                  <small>{weekdayShort(day, locale)}</small>
                </span>
              ))}
            </div>
            <dl className="week-recap-stats">
              <div><dt>{t("weekRecap.activeDays")}</dt><dd>{recap.activeDays} / 7</dd></div>
              <div><dt>{t("weekRecap.checkIns")}</dt><dd>{recap.checkIns}</dd></div>
              <div><dt>{t("weekRecap.tasksFinished")}</dt><dd>{recap.tasksFinished}</dd></div>
              <div><dt>{t("weekRecap.notesWritten")}</dt><dd>{recap.notesWritten}</dd></div>
            </dl>
            <p>{recap.activeDays === 0 ? t("weekRecap.quietWeek") : recap.bestRun >= 3 ? t("weekRecap.run", { days: recap.bestRun }) : t("weekRecap.movement")}</p>
            <button className="challenge-primary-action" type="button" disabled={sharing} onClick={() => void share()}><Share2 size={17} /> {t("weekRecap.share")}</button>
            <small className="week-recap-note">{t("weekRecap.privacy")}</small>
            {shareError ? <p className="step-suggest-note" role="status">{t("weekRecap.shareError")}</p> : null}
          </div>
        ) : <p>{t("app.common.loading")}</p>}
      </section>
    </div>
  );
}

function weekdayShort(day: string, locale: AppLocale): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(locale, { weekday: "short" });
}

type ImageLabels = { title: string; activeDays: string; checkIns: string; tasksFinished: string; notesWritten: string; footer: string };

/** Draws a 1080×1350 card in the browser; only counts are rendered. */
async function drawRecapImage(recap: WeekRecap, locale: AppLocale, labels: ImageLabels): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");

  const gradient = context.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#5b5cf0");
  gradient.addColorStop(1, "#13b5c8");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1350);

  context.fillStyle = "#ffffff";
  context.font = "800 64px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(labels.title, 90, 170);

  const max = Math.max(1, ...recap.perDay);
  recap.days.forEach((day, index) => {
    const x = 90 + index * 132;
    const height = Math.max(16, (recap.perDay[index] / max) * 360);
    context.fillStyle = recap.perDay[index] > 0 ? "#ffffff" : "rgba(255,255,255,0.35)";
    context.beginPath();
    context.roundRect?.(x, 620 - height, 92, height, 22);
    if (!context.roundRect) context.rect(x, 620 - height, 92, height);
    context.fill();
    context.fillStyle = "rgba(255,255,255,0.85)";
    context.font = "600 32px system-ui, -apple-system, Segoe UI, sans-serif";
    context.fillText(weekdayShort(day, locale), x + 10, 680);
  });

  const stats: [string, string][] = [
    [labels.activeDays, `${recap.activeDays} / 7`],
    [labels.checkIns, String(recap.checkIns)],
    [labels.tasksFinished, String(recap.tasksFinished)],
    [labels.notesWritten, String(recap.notesWritten)]
  ];
  stats.forEach(([label, value], index) => {
    const y = 820 + index * 110;
    context.fillStyle = "rgba(255,255,255,0.85)";
    context.font = "600 40px system-ui, -apple-system, Segoe UI, sans-serif";
    context.fillText(label, 90, y);
    context.fillStyle = "#ffffff";
    context.font = "800 56px system-ui, -apple-system, Segoe UI, sans-serif";
    context.textAlign = "right";
    context.fillText(value, 990, y);
    context.textAlign = "left";
  });

  context.fillStyle = "rgba(255,255,255,0.9)";
  context.font = "700 36px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(labels.footer, 90, 1270);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image_failed"))), "image/png"));
}
