"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type Reputation = {
  score: number;
  starter: number;
  fromBuyers: number;
  fromOwnReviews: number;
  received: { total: number; positive: number; neutral: number; negative: number; buyers: number };
  asOfDate: string | null;
};

/** Owner-only reputation: one number, and on demand what it is made of. Not shown to anyone else yet. */
export default function ReputationCard({ active }: { active: boolean }) {
  const { locale, t, user } = useUserContext();
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/trust/reputation?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = await response.json() as { reputation?: Reputation; error?: string };
        if (!cancelled && response.ok && payload.reputation) setReputation(payload.reputation);
      } catch {
        // Optional card.
      }
    })();
    return () => { cancelled = true; };
  }, [active, userId]);

  if (!reputation) return null;
  const number = (value: number, signed = false) => `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(value)}`;
  const date = reputation.asOfDate
    ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${reputation.asOfDate}T00:00:00Z`))
    : null;

  return (
    <details className="public-profile-box reputation-card">
      <summary>
        <span className="reputation-card-title"><ShieldCheck size={16} aria-hidden="true" />{t("reputation.title")}</span>
        <strong>{number(reputation.score)}</strong>
      </summary>
      <p className="reputation-card-private">{t("reputation.private")}</p>
      <dl>
        <div><dt>{t("reputation.starter")}</dt><dd>{number(reputation.starter, true)}</dd></div>
        <div>
          <dt>{t("reputation.fromBuyers", { reviews: reputation.received.total, buyers: reputation.received.buyers })}</dt>
          <dd>{number(reputation.fromBuyers, true)}</dd>
        </div>
        {reputation.received.total ? (
          <div className="reputation-card-split"><dt>{t("reputation.split", { positive: reputation.received.positive, neutral: reputation.received.neutral, negative: reputation.received.negative })}</dt><dd /></div>
        ) : null}
        <div><dt>{t("reputation.fromOwnReviews")}</dt><dd>{number(reputation.fromOwnReviews, true)}</dd></div>
      </dl>
      <p className="reputation-card-how">{t("reputation.how")}</p>
      {date ? <small>{t("reputation.updated", { date })}</small> : <small>{t("reputation.pending")}</small>}
    </details>
  );
}
