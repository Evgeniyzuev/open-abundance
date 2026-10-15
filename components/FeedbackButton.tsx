"use client";

import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type FeedbackCategory = "idea" | "problem" | "confusing" | "other";

const CATEGORIES: Array<{ key: FeedbackCategory; label: MessageKey }> = [
  { key: "idea", label: "feedback.category.idea" },
  { key: "problem", label: "feedback.category.problem" },
  { key: "confusing", label: "feedback.category.confusing" },
  { key: "other", label: "feedback.category.other" }
];

export default function FeedbackButton() {
  const { t, locale, user } = useUserContext();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!user) return null;

  function close() {
    setOpen(false);
    if (status === "sent") {
      setMessage("");
      setStatus("idle");
    }
  }

  async function send() {
    setStatus("sending");
    setErrorText(null);
    try {
      const view = new URLSearchParams(window.location.search).get("view");
      const response = await fetchWithSupabaseAuth("/api/feedback", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, screen: view ?? "home", locale })
      }, { authRequired: true });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? t("feedback.failed"));
      setStatus("sent");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : t("feedback.failed"));
      setStatus("error");
    }
  }

  return (
    <>
      <button className="profile-action-button" type="button" aria-label={t("feedback.open")} title={t("feedback.open")} aria-expanded={open} onClick={() => setOpen(true)}>
        <MessageSquarePlus size={18} />
        <span>{t("profile.actions.feedback")}</span>
      </button>
      {open ? (
        <Sheet bare className="small" titleId="feedback-title" onClose={close}>
            <h2 id="feedback-title">{t("feedback.title")}</h2>
            {status === "sent" ? (
              <>
                <p>{t("feedback.thanks")}</p>
                <button className="challenge-primary-action" type="button" onClick={close}>{t("app.common.close")}</button>
              </>
            ) : (
              <>
                <div className="feedback-categories" role="radiogroup" aria-label={t("feedback.type")}>
                  {CATEGORIES.map((item) => (
                    <button
                      aria-checked={category === item.key}
                      className={category === item.key ? "challenge-primary-action" : "secondary-button"}
                      key={item.key}
                      role="radio"
                      type="button"
                      onClick={() => setCategory(item.key)}
                    >
                      {t(item.label)}
                    </button>
                  ))}
                </div>
                <textarea
                  className="feedback-textarea"
                  maxLength={2000}
                  placeholder={t("feedback.placeholder")}
                  rows={5}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                {errorText ? <p className="challenge-error">{errorText}</p> : null}
                <button className="challenge-primary-action" disabled={status === "sending" || message.trim().length < 3} type="button" onClick={() => void send()}>
                  {status === "sending" ? t("app.common.loading") : t("feedback.send")}
                </button>
                <button className="secondary-button" type="button" onClick={close}>{t("app.common.close")}</button>
              </>
            )}
        </Sheet>
      ) : null}
    </>
  );
}
