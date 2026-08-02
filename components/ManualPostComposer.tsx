"use client";

import { ImagePlus, Send } from "lucide-react";
import { useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import type { FeedPost } from "@/lib/socialFeed";

export default function ManualPostComposer({
  draft,
  locale,
  saving,
  t,
  onBodyChange,
  onCreate,
  onPublish,
  onUpload,
  onVisibilityChange
}: {
  draft: FeedPost | null;
  locale: AppLocale;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBodyChange: (body: string) => void;
  onCreate: (body: string, visibility: "public" | "private", file: File | null) => void;
  onPublish: (post: FeedPost) => void;
  onUpload: (post: FeedPost, file: File) => void;
  onVisibilityChange: (visibility: "public" | "private") => void;
}) {
  const [newBody, setNewBody] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("public");
  const [newFile, setNewFile] = useState<File | null>(null);

  function chooseVisibility(value: "public" | "private") {
    setNewVisibility(value);
    if (draft) onVisibilityChange(value);
  }

  function submitNew(event: React.FormEvent) {
    event.preventDefault();
    onCreate(newBody, newVisibility, newFile);
    setNewBody("");
    setNewFile(null);
  }

  if (!draft) {
    return (
      <form className="manual-post-composer" onSubmit={submitNew}>
        <div className="section-heading-row">
          <span>{t("social.feed.manualPost")}</span>
        </div>
        <textarea
          maxLength={700}
          placeholder={t("social.feed.manualPostPlaceholder")}
          value={newBody}
          onChange={(event) => setNewBody(event.target.value)}
        />
        <div className="manual-post-controls">
          <label>
            <span>{t("social.feed.manualPostVisibility")}</span>
            <select value={newVisibility} onChange={(event) => chooseVisibility(event.target.value === "private" ? "private" : "public")}>
              <option value="public">{t("social.feed.public")}</option>
              <option value="private">{t("social.feed.private")}</option>
            </select>
          </label>
          <label className="manual-post-file secondary-button">
            <ImagePlus size={15} />
            {newFile ? newFile.name : t("social.feed.uploadMedia")}
            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={(event) => setNewFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="primary-button" type="submit" disabled={saving || (!newBody.trim() && !newFile)}>
            <Send size={15} />
            {t("social.feed.createManualPost")}
          </button>
        </div>
        <small>{t("social.feed.mediaHint")}</small>
      </form>
    );
  }

  const media = draft.media?.[0];
  const canPublish = Boolean(draft.body?.trim() || media);
  return (
    <section className="manual-post-composer">
      <div className="section-heading-row">
        <span>{t("social.feed.manualPost")}</span>
        <span className="post-status draft">{t("social.feed.draft")}</span>
      </div>
      <textarea maxLength={700} placeholder={t("social.feed.manualPostPlaceholder")} value={draft.body ?? ""} onChange={(event) => onBodyChange(event.target.value)} />
      <div className="manual-post-controls">
        <label>
          <span>{t("social.feed.manualPostVisibility")}</span>
          <select value={draft.visibility === "private" ? "private" : "public"} onChange={(event) => chooseVisibility(event.target.value === "private" ? "private" : "public")}>
            <option value="public">{t("social.feed.public")}</option>
            <option value="private">{t("social.feed.private")}</option>
          </select>
        </label>
        <label className="manual-post-file secondary-button">
          <ImagePlus size={15} />
          {media ? t("social.feed.replaceMedia") : t("social.feed.uploadMedia")}
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={saving} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(draft, file);
            event.currentTarget.value = "";
          }} />
        </label>
        <button className="primary-button" type="button" disabled={saving || !canPublish} onClick={() => onPublish(draft)}>
          <Send size={15} />
          {t("social.feed.publish")}
        </button>
      </div>
      {media?.media_url ? (
        media.media_type === "video" ? <video className="manual-post-media-preview" controls preload="metadata" src={media.media_url} /> : <img className="manual-post-media-preview" alt="" src={media.media_url} />
      ) : null}
      <small>{t("social.feed.mediaHint")}</small>
    </section>
  );
}
