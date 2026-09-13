"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";

export default function CoreJourneyCard({ onOpen }: { onOpen: () => void }) {
  const { core, money, t, user } = useUserContext();
  if (!user || !core) return null;
  const threshold = core.next_level_threshold;
  const remaining = typeof threshold === "number" && threshold > core.balance ? threshold - core.balance : null;

  return (
    <button className="core-journey-card" type="button" onClick={onOpen}>
      <span className="core-journey-orbit" aria-hidden="true"><Sparkles size={20} /></span>
      <span className="core-journey-value"><small>Core · {t("journey.level", { level: core.level })}</small><strong>{money.formatAdaptive(core.balance)}</strong></span>
      <span className="core-journey-next"><span>{remaining === null ? t("journey.growthPlan") : t("journey.toNextLevel", { amount: money.formatAdaptive(remaining) })}</span><ArrowUpRight size={17} aria-hidden="true" /></span>
    </button>
  );
}
