"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { AI_TOOL_FAILURE_KEYS, postAiTool, type AiToolFailure } from "@/lib/ai/toolClient";
import type { MessageKey } from "@/lib/i18n";
import { BRAIN_DUMP_BUCKETS, isBrainDumpResponse, normalizeBrainDumpItems, type BrainDumpBucket, type BrainDumpItem } from "@/lib/braindump";
import { saveNote } from "@/lib/notesStore";
import { todayKey } from "@/lib/taskSchedule";
import { saveTask } from "@/lib/tasksStore";
import { trackProductEvent } from "@/lib/productAnalytics";
import type { SafetyPayload } from "@/lib/ai/safety";

type BrainDumpModalProps = {
  initialText: string;
  onClose: () => void;
  onDone: () => void;
};

type Status = "input" | "loading" | "ready" | "error" | "offline" | "saving";

const BUCKET_LABEL_KEYS = {
  now: "braindump.now",
  today: "braindump.today",
  later: "braindump.later",
  drop: "braindump.drop"
} as const;

/**
 * Sorts a pasted brain dump on explicit request. The raw text is never saved;
 * confirmed items become ordinary local tasks, plus one note for "later".
 */
export default function BrainDumpModal({ initialText, onClose, onDone }: BrainDumpModalProps) {
  const { locale, t } = useUserContext();
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<Status>("input");
  const [failure, setFailure] = useState<AiToolFailure | null>(null);
  const [items, setItems] = useState<BrainDumpItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [safety, setSafety] = useState<SafetyPayload | null>(null);

  async function sort() {
    if (text.trim().length < 3 || status === "loading") return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("loading");
    setFailure(null);
    try {
      const aiResult = await postAiTool("/api/ai/notes/triage", { text, locale });
      if (!aiResult.ok) {
        setFailure(aiResult.reason);
        throw new Error(aiResult.reason);
      }
      const payload = aiResult.payload;
      if ((payload as { mode?: string } | null)?.mode === "safety") {
        setSafety(payload as SafetyPayload);
        setStatus("input");
        return;
      }
      if (!isBrainDumpResponse(payload)) throw new Error("triage_unavailable");
      const nextItems = normalizeBrainDumpItems(payload.items);
      if (nextItems.length === 0) throw new Error("triage_empty");
      setItems(nextItems);
      setSelected(new Set(nextItems.flatMap((item, index) => (item.bucket === "drop" ? [] : [index]))));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function create() {
    const chosen = items.filter((_, index) => selected.has(index));
    if (chosen.length === 0 || status === "saving") return;
    setStatus("saving");
    const day = todayKey();
    const focus = [...chosen.filter((item) => item.bucket === "now"), ...chosen.filter((item) => item.bucket === "today")];
    for (const item of focus) {
      await saveTask({ id: crypto.randomUUID(), title: item.text, description: "", schedule: { type: "once", date: day }, syncStatus: "local" });
    }
    const later = chosen.filter((item) => item.bucket === "later");
    if (later.length > 0) {
      await saveNote({
        id: crypto.randomUUID(),
        title: t("braindump.laterNote", { date: new Date().toLocaleDateString(locale, { day: "numeric", month: "short" }) }),
        body: later.map((item) => item.text).join("\n"),
        syncStatus: "local"
      });
    }
    trackProductEvent("brain_dump_created", { tasks: focus.length, later: later.length, letGo: items.filter((item) => item.bucket === "drop").length });
    onDone();
  }

  const showResults = status === "ready" || status === "saving";

  return (
    <Sheet bare dismissible={false} className="braindump-modal" ariaLabel={t("braindump.open")}>
        <div className="modal-header">
          <button className="text-button" type="button" onClick={onClose}>{t("app.common.cancel")}</button>
          <h2>{t("braindump.open")}</h2>
          {showResults ? (
            <button className="text-button primary" type="button" disabled={selected.size === 0 || status === "saving"} onClick={create}>{t("braindump.create", { count: selected.size })}</button>
          ) : <span />}
        </div>

        {!showResults ? (
          <>
            <textarea
              className="braindump-input"
              aria-label={t("braindump.open")}
              autoFocus
              placeholder={t("braindump.placeholder")}
              rows={7}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button className="challenge-primary-action" type="button" disabled={text.trim().length < 3 || status === "loading"} onClick={sort}>
              {status === "loading" ? t("braindump.loading") : t("braindump.sort")}
            </button>
            {status === "error" ? <p className="step-suggest-note" role="status">{failure && AI_TOOL_FAILURE_KEYS[failure] ? t(AI_TOOL_FAILURE_KEYS[failure] as MessageKey) : t("braindump.error")}</p> : null}
            {status === "offline" ? <p className="step-suggest-note" role="status">{t("braindump.offline")}</p> : null}
            {safety ? (
              <div className="reflection-safety" role="alert">
                <h3>{safety.title}</h3>
                <p>{safety.message}</p>
                <ul>{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="braindump-results">
            {BRAIN_DUMP_BUCKETS.map((bucket) => <BucketGroup key={bucket} bucket={bucket} items={items} selected={selected} onToggle={toggle} />)}
          </div>
        )}
    </Sheet>
  );
}

type BucketGroupProps = {
  bucket: BrainDumpBucket;
  items: BrainDumpItem[];
  selected: Set<number>;
  onToggle: (index: number) => void;
};

function BucketGroup({ bucket, items, selected, onToggle }: BucketGroupProps) {
  const { t } = useUserContext();
  const entries = items.map((item, index) => ({ item, index })).filter((entry) => entry.item.bucket === bucket);
  if (entries.length === 0) return null;
  return (
    <section className="braindump-group">
      <h3>{t(BUCKET_LABEL_KEYS[bucket])}</h3>
      <ul className="step-suggestions">
        {entries.map(({ item, index }) => (
          <li key={`${item.text}-${index}`}>
            <label>
              <input type="checkbox" checked={selected.has(index)} onChange={() => onToggle(index)} />
              <span>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
