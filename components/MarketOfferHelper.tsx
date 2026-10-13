"use client";

import { useState } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { AI_TOOL_FAILURE_KEYS, postAiTool, type AiToolFailure } from "@/lib/ai/toolClient";
import type { SafetyPayload } from "@/lib/ai/safety";
import type { MessageKey } from "@/lib/i18n";
import { isListingDraft, MARKET_TEMPLATES, MAX_SKILL_TEXT, normalizeListingDraft, type ListingDraft } from "@/lib/marketListingDraft";
import { trackProductEvent } from "@/lib/productAnalytics";

type MarketOfferHelperProps = {
  onApply: (draft: ListingDraft) => void;
};

type Mode = "ideas" | "ai" | null;

/**
 * Two optional helpers above the sell form: ready-made small offers and an AI that packages
 * the person's own words. Both only fill the form; price and publishing stay with the person.
 */
export default function MarketOfferHelper({ onApply }: MarketOfferHelperProps) {
  const { locale, t } = useUserContext();
  const [mode, setMode] = useState<Mode>(null);
  const [skill, setSkill] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<AiToolFailure | null>(null);
  const [safety, setSafety] = useState<SafetyPayload | null>(null);
  const [filled, setFilled] = useState(false);

  function apply(draft: ListingDraft, source: "template" | "ai") {
    onApply(draft);
    setFilled(true);
    setMode(null);
    trackProductEvent("market_offer_prefilled", { source });
  }

  async function packageSkill() {
    if (skill.trim().length < 3 || loading) return;
    setLoading(true);
    setFailure(null);
    setSafety(null);
    const result = await postAiTool("/api/ai/market/listing-draft", { skill, locale });
    setLoading(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    if ((result.payload as { mode?: string } | null)?.mode === "safety") {
      setSafety(result.payload as SafetyPayload);
      return;
    }
    const draft = isListingDraft(result.payload) ? normalizeListingDraft(result.payload) : null;
    if (!draft) {
      setFailure("error");
      return;
    }
    apply(draft, "ai");
  }

  return (
    <div className="market-offer-helper">
      <div className="market-offer-helper-toggles">
        <button className={mode === "ideas" ? "text-button active" : "text-button"} type="button" aria-expanded={mode === "ideas"} onClick={() => setMode(mode === "ideas" ? null : "ideas")}>
          <Lightbulb size={15} /> {t("market.helper.ideas")}
        </button>
        <button className={mode === "ai" ? "text-button active" : "text-button"} type="button" aria-expanded={mode === "ai"} onClick={() => setMode(mode === "ai" ? null : "ai")}>
          <Sparkles size={15} /> {t("market.helper.ai")}
        </button>
      </div>

      {mode === "ideas" ? (
        <div className="market-offer-ideas">
          {MARKET_TEMPLATES.map((template) => (
            <button
              className="subtask-chip"
              key={template.n}
              type="button"
              onClick={() => apply({
                title: t(`marketTemplate.${template.n}.title` as MessageKey),
                description: t(`marketTemplate.${template.n}.description` as MessageKey),
                listingKind: template.listingKind,
                fulfillmentDays: template.fulfillmentDays
              }, "template")}
            >
              {t(`marketTemplate.${template.n}.title` as MessageKey)}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "ai" ? (
        <div className="market-offer-ai">
          <textarea
            className="braindump-input"
            aria-label={t("market.helper.ai")}
            placeholder={t("market.helper.placeholder")}
            rows={3}
            maxLength={MAX_SKILL_TEXT}
            value={skill}
            onChange={(event) => setSkill(event.target.value)}
          />
          <button className="secondary-button" type="button" disabled={skill.trim().length < 3 || loading} onClick={() => void packageSkill()}>
            {loading ? t("market.helper.loading") : t("market.helper.fill")}
          </button>
          {failure ? <p className="step-suggest-note" role="status">{AI_TOOL_FAILURE_KEYS[failure] ? t(AI_TOOL_FAILURE_KEYS[failure] as MessageKey) : failure === "offline" ? t("market.helper.offline") : t("market.helper.error")}</p> : null}
          {safety ? (
            <div className="reflection-safety" role="alert">
              <h3>{safety.title}</h3>
              <p>{safety.message}</p>
              <ul>{safety.actions.map((action) => <li key={action}>{action}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {filled ? <p className="step-suggest-note" role="status">{t("market.helper.filled")}</p> : null}
    </div>
  );
}
