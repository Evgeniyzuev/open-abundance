"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BellRing, Check, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { describeTimes, NOTICED_TEXT_MAX, type NoticedEntry } from "@/lib/noticed";
import { trackProductEvent } from "@/lib/productAnalytics";
import { enablePushAndGetSubscription, isPushSupported, registerPushDevice } from "@/lib/pushReminders";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

const COPY = {
  ru: {
    label: "Заметил",
    placeholder: "Что заметил? Мысль, желание…",
    thinking: "Нова думает…",
    remind: "Напоминать",
    reminding: "Напоминаю",
    done: "Готово",
    failed: "Не получилось. Попробуй ещё раз",
    mine: "Мои действия"
  },
  en: {
    label: "Noticed",
    placeholder: "Noticed something? A thought…",
    thinking: "Nova is thinking…",
    remind: "Remind me",
    reminding: "Reminding",
    done: "Done",
    failed: "That didn't work. Try again",
    mine: "My actions"
  }
} as const;

/**
 * «Заметил» on Home: one line for any small thing; Nova answers with one action and reminder times. Hidden until the
 * noticed_entries migration exists (GET answers available:false).
 */
export function NoticedCard({ active }: { active: boolean }) {
  const { user, locale } = useUserContext();
  const copy = locale === "ru" ? COPY.ru : COPY.en;
  const [available, setAvailable] = useState(false);
  const [entries, setEntries] = useState<NoticedEntry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    void fetchWithSupabaseAuth("/api/noticed", { cache: "no-store" }, { authRequired: true })
      .then((response) => response.json())
      .then((payload: { available?: boolean; entries?: NoticedEntry[] }) => {
        if (cancelled) return;
        setAvailable(Boolean(payload.available));
        setEntries(payload.entries ?? []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active, user]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }, [text]);

  if (!user || !available) return null;

  const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setSafety(null);
    try {
      const response = await fetchWithSupabaseAuth("/api/noticed", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, locale, timezone: timezone() })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { entry?: NoticedEntry; safety?: { message?: string } };
      if (payload.safety) {
        setSafety(payload.safety.message ?? "");
        return;
      }
      if (!response.ok || !payload.entry) throw new Error("failed");
      setEntries((current) => [payload.entry!, ...current]);
      setFresh(payload.entry.id);
      setText("");
      trackProductEvent("noticed_created", { times: payload.entry.times.length });
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const response = await fetchWithSupabaseAuth("/api/noticed", {
      method: "PATCH",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body })
    }, { authRequired: true });
    const payload = (await response.json().catch(() => ({}))) as { entry?: NoticedEntry };
    if (payload.entry) setEntries((current) => current.map((item) => (item.id === id ? payload.entry! : item)));
    return payload.entry;
  }

  async function remind(entry: NoticedEntry) {
    const on = !entry.remindersOn;
    if (on && isPushSupported() && Notification.permission !== "granted") {
      // Telegram copies still arrive without browser push, so a refusal here does not block the reminder.
      await enablePushAndGetSubscription().catch(() => null);
    }
    if (on) await registerPushDevice().catch(() => false);
    await patch(entry.id, { remindersOn: on, timezone: timezone() });
    trackProductEvent("noticed_reminders", { on });
  }

  async function finish(entry: NoticedEntry) {
    await patch(entry.id, { status: "done", remindersOn: false });
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    trackProductEvent("noticed_done", {});
  }

  const newest = entries.find((item) => item.id === fresh);
  const others = entries.filter((item) => item.id !== fresh).slice(0, 4);

  return (
    <section className="noticed-card" aria-label={copy.label}>
      <span className="noticed-label">{copy.label}</span>
      <div className="noticed-input">
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={NOTICED_TEXT_MAX}
          placeholder={copy.placeholder}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="noticed-send" aria-label={copy.label} disabled={busy || !text.trim()} onClick={() => void send()}>
          <ArrowUp size={18} strokeWidth={2.6} />
        </button>
      </div>
      {busy ? <p className="noticed-hint">{copy.thinking}</p> : null}
      {error ? <p className="noticed-hint error">{error}</p> : null}
      {safety ? <p className="noticed-hint error">{safety}</p> : null}

      {newest ? (
        <div className="noticed-answer">
          {newest.reply ? <p className="noticed-reply">{newest.reply}</p> : null}
          <div className="noticed-action">
            <strong>{newest.action}</strong>
            {newest.times.length ? <span>{describeTimes(newest.times, newest.weekdaysOnly, locale)}</span> : null}
          </div>
          <div className="noticed-buttons">
            {newest.times.length ? (
              <button type="button" className={newest.remindersOn ? "noticed-chip on" : "noticed-chip"} onClick={() => void remind(newest)}>
                <BellRing size={15} /> {newest.remindersOn ? copy.reminding : copy.remind}
              </button>
            ) : null}
            <button type="button" className="noticed-chip" onClick={() => void finish(newest)}><Check size={15} /> {copy.done}</button>
          </div>
        </div>
      ) : null}

      {others.length ? (
        <ul className="noticed-list" aria-label={copy.mine}>
          {others.map((entry) => (
            <li key={entry.id}>
              <span className="noticed-list-text">
                <strong>{entry.action}</strong>
                {entry.times.length ? <small>{describeTimes(entry.times, entry.weekdaysOnly, locale)}</small> : null}
              </span>
              {entry.times.length ? (
                <button type="button" className={entry.remindersOn ? "noticed-icon on" : "noticed-icon"} aria-pressed={entry.remindersOn} aria-label={copy.remind} onClick={() => void remind(entry)}>
                  <BellRing size={16} />
                </button>
              ) : null}
              <button type="button" className="noticed-icon" aria-label={copy.done} onClick={() => void finish(entry)}><X size={16} /></button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
