"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { playUiSound } from "@/lib/ui/sound";

const FOCUS_MINUTES = 5;

/** A single-button timebox kept in memory only; it never creates data or notifications. */
export default function FocusTimer() {
  const { t } = useUserContext();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const finished = endsAt !== null && now >= endsAt;

  useEffect(() => {
    if (endsAt === null || finished) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, finished]);

  useEffect(() => {
    if (finished) playUiSound("action");
  }, [finished]);

  function start() {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + FOCUS_MINUTES * 60_000);
  }

  if (endsAt === null) {
    return <button className="secondary-button focus-timer-button" type="button" onClick={start}><Timer size={16} /> {t("tasks.focus.start", { count: FOCUS_MINUTES })}</button>;
  }

  if (finished) {
    return (
      <div className="focus-timer" role="status">
        <strong>{t("tasks.focus.done")}</strong>
        <button className="secondary-button" type="button" onClick={start}>{t("tasks.focus.more", { count: FOCUS_MINUTES })}</button>
        <button className="text-button" type="button" onClick={() => setEndsAt(null)}>{t("tasks.focus.stop")}</button>
      </div>
    );
  }

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="focus-timer">
      <strong aria-live="off">{t("tasks.focus.running", { time: label })}</strong>
      <button className="text-button" type="button" onClick={() => setEndsAt(null)}>{t("tasks.focus.stop")}</button>
    </div>
  );
}
