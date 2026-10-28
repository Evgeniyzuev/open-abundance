"use client";

import { Check, ImagePlus, Send } from "lucide-react";
import { useRef, useState } from "react";
import { trackClientEvent } from "@/lib/clientAnalytics";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const MAX_TEXT = 500;
// Nova asks about the quest itself where there is a good question; other quests get the general one.
const QUESTIONS: Record<string, MessageKey> = {
  has_wish: "quests.share.question.has_wish",
  calculate_time_to_goal: "quests.share.question.calculate_time_to_goal",
  attention_value_audit: "quests.share.question.attention_value_audit",
  first_step_motive: "quests.share.question.first_step_motive",
  first_marketplace_listing: "quests.share.question.first_marketplace_listing"
};

/**
 * Right after a quest reward: "Will you share how it went?" One sentence and an optional photo publish the quest's
 * result post in one tap. With the person's own photo the post goes to the main feed, without it to the System feed.
 */
export default function QuestShareBox({ challengeId, logic, postId, questTitle, t }: {
  challengeId: string;
  logic: string | null;
  postId: string;
  questTitle: string;
  t: TFunction;
}) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  function choosePhoto(file: File | null) {
    setPhoto(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function publish() {
    if (!text.trim() && !photo) return;
    setState("saving");
    try {
      if (photo) {
        const form = new FormData();
        form.append("file", photo);
        const upload = await fetchWithSupabaseAuth(`/api/social/feed/posts/${postId}/cover`, { method: "POST", body: form }, { authRequired: true });
        if (!upload.ok) throw new Error("cover");
      }
      const body = [text.trim(), t("quests.share.verifiedLine", { title: questTitle })].filter(Boolean).join("\n\n");
      const response = await fetchWithSupabaseAuth(`/api/social/feed/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, action: "publish", visibility: "public" })
      }, { authRequired: true });
      if (!response.ok) throw new Error("publish");
      setState("done");
      void trackClientEvent("quest_result_shared", { challenge_id: challengeId, logic, with_photo: Boolean(photo), text_length: text.trim().length });
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return <p className="quest-share-done"><Check size={16} aria-hidden="true" /> {t(photo ? "quests.share.doneMain" : "quests.share.doneSystem")}</p>;
  }

  return (
    <section className="quest-share" aria-labelledby="quest-share-title">
      <strong id="quest-share-title">{t("quests.share.title")}</strong>
      <p className="quest-share-question"><span aria-hidden="true">✨</span> {t(QUESTIONS[logic ?? ""] ?? "quests.share.question.default")}</p>
      <textarea
        aria-labelledby="quest-share-title"
        maxLength={MAX_TEXT}
        placeholder={t("quests.share.placeholder")}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {preview ? <img alt="" className="quest-share-preview" src={preview} /> : null}
      <div className="quest-share-actions">
        <button className="challenge-secondary-action" type="button" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          {t(photo ? "quests.share.changePhoto" : "quests.share.addPhoto")}
        </button>
        <button className="challenge-primary-action" disabled={state === "saving" || (!text.trim() && !photo)} type="button" onClick={() => { void publish(); }}>
          <Send size={16} aria-hidden="true" />
          {t(state === "saving" ? "app.common.loading" : "quests.share.publish")}
        </button>
      </div>
      <input ref={fileRef} accept="image/jpeg,image/png,image/webp" hidden type="file" onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)} />
      <small>{state === "failed" ? t("quests.share.failed") : t("quests.share.hint")}</small>
    </section>
  );
}
