"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, ImagePlus, Share2, Sparkles, X } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { realityWinsCount, type RealityDaySummary } from "@/lib/realityDay";
import { formatStatBlockValue, statBlockLabelKey } from "@/lib/realityDayFormat";
import type { MessageKey } from "@/lib/i18n";
import { playUiSound } from "@/lib/ui/sound";

type DayPreview = {
  date: string;
  summary: RealityDaySummary;
  levelBefore: number;
  levelAfter: number;
  coreGrowth: number;
  hasContent: boolean;
  post: { id: string; status: string; published_at: string | null } | null;
};

type DraftBlock = { block_key: string; value: unknown; visibility: string };
type DraftPayload = { post?: { id: string; status: string; body: string | null; author_user_id: string | null; statBlocks: DraftBlock[] }; error?: string };

const TURNOVER_SOURCES: Array<[keyof RealityDaySummary["turnover"], MessageKey]> = [
  ["sales", "reality.day.source.sales"],
  ["people", "reality.day.source.people"],
  ["core", "reality.day.source.core"],
  ["rewards", "reality.day.source.rewards"],
  ["deposits", "reality.day.source.deposits"],
  ["other", "reality.day.source.other"]
];

const SPENT_SOURCES: Array<[keyof RealityDaySummary["spent"], MessageKey]> = [
  ["purchases", "reality.day.source.purchases"],
  ["people", "reality.day.source.peopleOut"],
  ["cashOut", "reality.day.source.cashOut"],
  ["core", "reality.day.source.coreTopup"],
  ["other", "reality.day.source.other"]
];

/** Home card for today's reality post: one number, one button; details live in the sheet. */
export default function RealityDayCard({ active }: { active: boolean }) {
  const { locale, t, user } = useUserContext();
  const [preview, setPreview] = useState<DayPreview | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const requestIdRef = useRef(0);
  const userId = user?.id ?? null;

  const loadPreview = useCallback(async () => {
    if (!userId) return;
    const requestId = ++requestIdRef.current;
    try {
      const response = await fetchWithSupabaseAuth(`/api/social/feed/daily-progress/draft?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
      const payload = await response.json() as DayPreview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Day unavailable");
      if (requestId === requestIdRef.current) setPreview(payload);
    } catch {
      // The card is optional; Home stays usable without it.
    }
  }, [userId]);

  useEffect(() => {
    if (active) void loadPreview();
  }, [active, loadPreview]);

  if (!user || !preview || (!preview.hasContent && !preview.post)) return null;

  const published = preview.post?.status === "published";
  const wins = realityWinsCount(preview.summary);

  return (
    <>
      <section className="home-card reality-day-card">
        <div className="reality-day-head">
          <span className="home-card-label"><Sparkles size={14} aria-hidden="true" />{t("reality.day.title")}</span>
          {published ? <span className="reality-day-done"><Check size={14} aria-hidden="true" />{t("reality.day.published")}</span> : null}
        </div>
        <div className="reality-day-numbers">
          <span><strong>+{formatAdaptiveMoney(preview.summary.turnover.total, locale)}</strong><small>{t("social.post.turnover")}</small></span>
          <span><strong>{wins}</strong><small>{t("social.post.wins")}</small></span>
          <span><strong>{preview.levelAfter > preview.levelBefore ? `${preview.levelBefore} → ${preview.levelAfter}` : `Lvl ${preview.levelAfter}`}</strong><small>{t("social.post.level")}</small></span>
        </div>
        <button className={published ? "secondary-button" : "challenge-primary-action"} type="button" onClick={() => setSheetOpen(true)}>
          {published ? t("reality.day.update") : t("reality.day.publish")}
        </button>
      </section>
      {sheetOpen ? (
        <RealityDaySheet
          preview={preview}
          onClose={() => setSheetOpen(false)}
          onPublished={() => { void loadPreview(); }}
        />
      ) : null}
    </>
  );
}

function RealityDaySheet({ preview, onClose, onPublished }: { preview: DayPreview; onClose: () => void; onPublished: () => void }) {
  const { locale, t } = useUserContext();
  const [draft, setDraft] = useState<DraftPayload["post"] | null>(null);
  const [caption, setCaption] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const alreadyPublished = preview.post?.status === "published";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth("/api/social/feed/daily-progress/draft", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: preview.date })
        }, { authRequired: true });
        const payload = await response.json() as DraftPayload;
        if (!response.ok || !payload.post) throw new Error(payload.error ?? "Draft unavailable");
        if (cancelled) return;
        setDraft(payload.post);
        setCaption(isDefaultBody(payload.post.body) ? "" : payload.post.body ?? "");
        setHidden(new Set(payload.post.statBlocks.filter((block) => block.visibility !== "public").map((block) => block.block_key)));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();
    return () => { cancelled = true; };
  }, [preview.date]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleBlock(blockKey: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(blockKey)) next.delete(blockKey);
      else next.add(blockKey);
      return next;
    });
  }

  async function publish() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (file && !alreadyPublished) {
        const form = new FormData();
        form.append("file", file);
        const uploadResponse = await fetchWithSupabaseAuth(`/api/social/feed/posts/${draft.id}/media`, { method: "POST", body: form }, { authRequired: true });
        const uploadPayload = await uploadResponse.json() as { error?: string };
        if (!uploadResponse.ok) throw new Error(uploadPayload.error ?? "Upload failed");
      }
      const response = await fetchWithSupabaseAuth(`/api/social/feed/posts/${draft.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          visibility: "public",
          ...(caption.trim() ? { body: caption.trim() } : {}),
          statBlocks: draft.statBlocks.map((block) => ({ blockKey: block.block_key, visibility: hidden.has(block.block_key) ? "private" : "public" }))
        })
      }, { authRequired: true });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Publish failed");
      playUiSound("reward");
      setDone(true);
      onPublished();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : String(publishError));
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!draft) return;
    const url = `${window.location.origin}/u/${draft.author_user_id ?? ""}/blog?post=${draft.id}`;
    const text = caption.trim() || t("reality.day.title");
    try {
      // Share the day card image with the link where the device supports files; otherwise the link alone.
      let files: File[] = [];
      try {
        const image = await fetch(`/api/reality/card/${draft.id}?format=post&locale=${locale}`, { cache: "no-store" });
        if (image.ok) files = [new File([await image.blob()], "open-abundance-day.png", { type: "image/png" })];
      } catch {
        files = [];
      }
      if (files.length && typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        await navigator.share({ title: text.slice(0, 80), text: `${text}\n${url}`, files });
      } else if (typeof navigator.share === "function") {
        await navigator.share({ title: text.slice(0, 80), text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
    } catch {
      // A cancelled share is not an error.
    }
  }

  const blocks = draft?.statBlocks ?? [];
  const visibleBlocks = blocks.filter((block) => !hidden.has(block.block_key));
  const { summary } = preview;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet reality-day-sheet" role="dialog" aria-modal="true" aria-labelledby="reality-day-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><span /><h2 id="reality-day-title">{t("reality.day.title")}</h2></div>

        {!draft && !error ? <p className="home-status">{t("app.common.loading")}</p> : null}

        {draft ? (
          <>
            <div className="reality-day-preview" aria-live="polite">
              {visibleBlocks.map((block) => (
                <span className="reality-day-stat" key={block.block_key}>
                  <small>{t(statBlockLabelKey(block.block_key))}</small>
                  <strong>{formatStatBlockValue(block, locale)}</strong>
                </span>
              ))}
            </div>

            <details className="reality-day-details">
              <summary>{t("social.post.turnover")} · {t("social.post.spent")}<ChevronDown size={16} aria-hidden="true" /></summary>
              <dl>
                {TURNOVER_SOURCES.filter(([key]) => summary.turnover[key] > 0).map(([key, label]) => (
                  <div key={`in-${key}`}><dt>{t(label)}</dt><dd>+{formatAdaptiveMoney(summary.turnover[key], locale)}</dd></div>
                ))}
                {summary.turnover.uniquePayers > 0 ? <div><dt>{t("reality.day.payers", { count: summary.turnover.uniquePayers })}</dt><dd /></div> : null}
                {SPENT_SOURCES.filter(([key]) => summary.spent[key] > 0).map(([key, label]) => (
                  <div key={`out-${key}`}><dt>{t(label)}</dt><dd>-{formatAdaptiveMoney(summary.spent[key], locale)}</dd></div>
                ))}
                {summary.wins.challenges.length ? <div><dt>{t("reality.day.challenges", { count: summary.wins.challenges.length })}</dt><dd /></div> : null}
                {summary.wins.wishes.length ? <div><dt>{t("reality.day.wishes", { count: summary.wins.wishes.length })}</dt><dd /></div> : null}
              </dl>
            </details>

            <details className="reality-day-details">
              <summary>{t("reality.day.whatToShow")}<ChevronDown size={16} aria-hidden="true" /></summary>
              <div className="reality-day-toggles">
                {blocks.map((block) => (
                  <label key={block.block_key}>
                    <input type="checkbox" checked={!hidden.has(block.block_key)} onChange={() => toggleBlock(block.block_key)} />
                    <span>{t(statBlockLabelKey(block.block_key))}</span>
                  </label>
                ))}
              </div>
            </details>

            <label className="reality-day-caption">
              <span className="sr-only">{t("reality.day.caption")}</span>
              <textarea value={caption} maxLength={700} rows={2} placeholder={t("reality.day.caption")} onChange={(event) => setCaption(event.target.value)} />
            </label>

            {!alreadyPublished ? (
              <div className="reality-day-media">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  hidden
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={16} aria-hidden="true" />{file ? file.name : t("reality.day.addMedia")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {error ? <p className="home-error" role="alert">{error}</p> : null}

        {done ? (
          <div className="reality-day-actions">
            <p className="reality-day-done"><Check size={16} aria-hidden="true" />{t("reality.day.published")}</p>
            <button className="challenge-primary-action" type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true" />{t("social.feed.share")}</button>
            {draft ? (
              <a className="secondary-button" href={`/api/reality/card/${draft.id}?format=story&locale=${locale}`} download="open-abundance-story.png">
                <Download size={16} aria-hidden="true" />{t("reality.day.downloadStory")}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="reality-day-actions">
            <button className="challenge-primary-action" type="button" disabled={!draft || saving} onClick={() => void publish()}>
              {alreadyPublished ? t("reality.day.update") : t("reality.day.publish")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function isDefaultBody(value: string | null): boolean {
  return !value || value.startsWith("My Growth: ") || value.startsWith("Daily Core progress for ");
}
