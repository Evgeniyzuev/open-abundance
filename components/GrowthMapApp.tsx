"use client";

import { ArrowRight, Backpack, BookOpen, Check, Compass, MapPin, RefreshCw, Sparkles, Users, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useUserContext } from "@/components/UserProvider";
import { readPrimaryWish } from "@/lib/wishJourney";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import type { MessageKey } from "@/lib/i18n";

type ExpeditionNode = {
  id: string;
  kind: "discovery" | "mission" | "together" | "creation";
  state: "hidden" | "available" | "active" | "complete";
  title: string;
  description: string;
  imageUrl: string | null;
  sourceId: string | null;
  sourceView: string | null;
  reward: { core: number; progressPercent: number; item: Record<string, unknown> | null } | null;
  meta: Record<string, unknown>;
};

type ExpeditionPayload = {
  destination: { id: string; title: string; description: string; imageUrl: string | null } | null;
  nodes: ExpeditionNode[];
  activeMission: ExpeditionNode | null;
  companions: Array<{ id: string; title: string; description: string; status: string; role: "leader" | "member" }>;
  unlocks: { coreLevel: number; coreBalance: number; awardedCore: number; availableCore: number; artifacts: Array<{ id: string; title: string; rarity: string; artifactType: string }> };
};

type GrowthMapAppProps = {
  active: boolean;
  refreshNonce: number;
  onOpenChallenge?: (id: string) => void;
  onOpenFeed?: () => void;
  onOpenTeams?: () => void;
  onOpenWishes?: () => void;
  onOpenBlog?: () => void;
};

type ExpeditionStatus = "loading" | "ready" | "unauthenticated" | "offline" | "error";

const NODE_ICONS: Record<ExpeditionNode["kind"], typeof Compass> = {
  discovery: BookOpen,
  mission: WandSparkles,
  together: Users,
  creation: Sparkles
};

export default function GrowthMapApp({ active, refreshNonce, onOpenChallenge, onOpenFeed, onOpenTeams, onOpenWishes, onOpenBlog }: GrowthMapAppProps) {
  const { locale, t, user } = useUserContext();
  const [payload, setPayload] = useState<ExpeditionPayload | null>(null);
  const [status, setStatus] = useState<ExpeditionStatus>("loading");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadExpedition = useCallback(async () => {
    if (!active) return;
    if (!user) {
      setPayload(null);
      setStatus("unauthenticated");
      return;
    }
    if (!navigator.onLine) {
      setStatus((current) => current === "ready" ? current : "offline");
      return;
    }

    setStatus((current) => current === "ready" ? current : "loading");
    try {
      const primaryWish = readPrimaryWish(user.id);
      const query = primaryWish?.id ? `?wishId=${encodeURIComponent(primaryWish.id)}&ts=${Date.now()}` : `?ts=${Date.now()}`;
      const response = await fetchWithSupabaseAuth(`/api/expedition${query}`, { cache: "no-store" }, { authRequired: true });
      const next = await response.json() as ExpeditionPayload & { error?: string };
      if (!response.ok || next.error) throw new Error(next.error ?? "Failed to load expedition.");
      setPayload(next);
      setStatus("ready");
      setSelectedNodeId((current) => current && next.nodes.some((node) => node.id === current) ? current : next.activeMission?.id ?? next.nodes[0]?.id ?? null);
    } catch (error) {
      setStatus((current) => current === "ready" ? current : "error");
      console.warn("Expedition load failed", error);
    }
  }, [active, user]);

  useEffect(() => { void loadExpedition(); }, [loadExpedition, refreshNonce]);

  if (status === "unauthenticated") {
    return <ExpeditionEmpty icon={<Compass size={38} />} title={t("expedition.authTitle")} description={t("expedition.authDescription")} />;
  }
  if (status === "loading" && !payload) {
    return <ExpeditionEmpty icon={<RefreshCw className="growth-map-spin" size={28} />} title={t("app.common.loading")} />;
  }
  if (status === "error" && !payload) {
    return <ExpeditionEmpty icon={<Compass size={38} />} title={t("expedition.errorTitle")} description={t("expedition.errorDescription")} onRetry={() => void loadExpedition()} retryLabel={t("app.common.retry")} />;
  }

  const selectedNode = payload?.nodes.find((node) => node.id === selectedNodeId) ?? payload?.activeMission ?? payload?.nodes[0] ?? null;
  const nodes = payload?.nodes ?? [];

  return (
    <section className="expedition-screen">
      <header className="expedition-header">
        <div><span>{t("expedition.kicker")}</span><h1>{t("expedition.title")}</h1></div>
        <button className="finance-small-icon-button" type="button" aria-label={t("app.common.refresh")} onClick={() => void loadExpedition()}><RefreshCw size={17} /></button>
      </header>

      <section className="expedition-destination">
        <div className="expedition-destination-icon"><MapPin size={25} /></div>
        <div className="expedition-destination-copy"><span>{t("expedition.destinationLabel")}</span><h2>{payload?.destination?.title ?? t("expedition.openDestination")}</h2><p>{payload?.destination?.description ?? t("expedition.destinationEmpty")}</p></div>
        {onOpenWishes ? <button className="text-button" type="button" onClick={onOpenWishes}>{t("expedition.changeDestination")}</button> : null}
      </section>

      <section className="expedition-progress" aria-label={t("expedition.progressAria")}>
        <div><span>{t("expedition.level", { level: payload?.unlocks.coreLevel ?? 1 })}</span><strong>{formatNumber(payload?.unlocks.coreBalance ?? 0, locale)} Core</strong></div>
        <div><span>{t("expedition.availableRewards")}</span><strong>{formatNumber(payload?.unlocks.availableCore ?? 0, locale)} Core</strong></div>
        <div><span>{t("expedition.finds")}</span><strong>{payload?.unlocks.artifacts.length ?? 0}</strong></div>
      </section>

      <div className="expedition-map-heading"><div><span>{t("expedition.routeLabel")}</span><h2>{t("expedition.chooseRoute")}</h2></div><small>{t("expedition.routeHint")}</small></div>
      {status === "offline" ? <p className="home-status">{t("home.offline")}</p> : null}

      <section className="expedition-node-grid" aria-label={t("expedition.nodesAria")}>
        {nodes.length > 0 ? nodes.map((node) => <ExpeditionNodeCard key={node.id} node={node} selected={node.id === selectedNode?.id} locale={locale} t={t} onSelect={() => setSelectedNodeId(node.id)} />) : <div className="expedition-empty-route"><Compass size={26} /><p>{t("expedition.noNodes")}</p></div>}
      </section>

      {selectedNode ? <section className="expedition-detail" aria-live="polite">
        <div className="expedition-detail-heading"><NodeIcon kind={selectedNode.kind} /><div><span>{t(nodeKindKey(selectedNode.kind))}</span><h2>{selectedNode.title}</h2></div><NodeState state={selectedNode.state} t={t} /></div>
        <p>{selectedNode.description}</p>
        {selectedNode.reward ? <div className="expedition-reward-line"><Sparkles size={16} /><strong>+{formatNumber(selectedNode.reward.core, locale)} Core</strong><span>{selectedNode.reward.progressPercent}% {t("expedition.progressWord")}</span></div> : null}
        <div className="expedition-detail-actions"><button className="challenge-primary-action" type="button" disabled={selectedNode.state === "hidden" || selectedNode.state === "complete"} onClick={() => openNode(selectedNode, { onOpenChallenge, onOpenFeed, onOpenTeams, onOpenWishes, onOpenBlog })}>{selectedNode.state === "complete" ? <><Check size={17} />{t("expedition.completed")}</> : <>{t("expedition.openStep")}<ArrowRight size={17} /></>}</button><small>{t("expedition.noPenalty")}</small></div>
      </section> : null}

      {payload?.companions.length ? <section className="expedition-companions"><div className="expedition-section-heading"><div><span>{t("expedition.togetherLabel")}</span><h2>{t("expedition.circleTitle")}</h2></div>{onOpenTeams ? <button className="text-button" type="button" onClick={onOpenTeams}>{t("expedition.openCircle")}</button> : null}</div>{payload.companions.slice(0, 3).map((companion) => <div className="expedition-companion" key={companion.id}><Users size={17} /><span><strong>{companion.title}</strong><small>{companion.description}</small></span><em>{companion.status}</em></div>)}</section> : null}

      {payload?.unlocks.artifacts.length ? <section className="expedition-finds"><div className="expedition-section-heading"><div><span>{t("expedition.findsLabel")}</span><h2>{t("expedition.collectionTitle")}</h2></div><Backpack size={20} /></div><div className="expedition-artifact-row">{payload.unlocks.artifacts.slice(0, 6).map((artifact) => <span className="expedition-artifact" key={artifact.id}><Sparkles size={15} /><b>{artifact.title}</b><small>{artifact.rarity}</small></span>)}</div></section> : null}
    </section>
  );
}

function ExpeditionNodeCard({ node, selected, locale, t, onSelect }: { node: ExpeditionNode; selected: boolean; locale: string; t: (key: MessageKey, values?: Record<string, string | number>) => string; onSelect: () => void }) {
  const Icon = NODE_ICONS[node.kind];
  return <button className={`expedition-node-card ${node.kind} ${node.state}${selected ? " selected" : ""}`} type="button" aria-pressed={selected} onClick={onSelect}><span className="expedition-node-icon"><Icon size={21} /></span><span className="expedition-node-copy"><small>{t(nodeKindKey(node.kind))}</small><strong>{node.title}</strong><em>{node.state === "active" ? t("expedition.stateActive") : node.state === "complete" ? t("expedition.stateComplete") : node.state === "hidden" ? t("expedition.stateHidden") : t("expedition.stateAvailable")}</em></span>{node.reward ? <b className="expedition-node-reward">+{formatNumber(node.reward.core, locale)}</b> : null}</button>;
}

function ExpeditionEmpty({ icon, title, description, onRetry, retryLabel }: { icon: ReactNode; title: string; description?: string; onRetry?: () => void; retryLabel?: string }) {
  return <section className="expedition-screen"><header className="expedition-header"><div><span>Open Abundance</span><h1>Expedition</h1></div><Compass size={28} /></header><div className="expedition-empty-route">{icon}<strong>{title}</strong>{description ? <p>{description}</p> : null}{onRetry ? <button className="secondary-button" type="button" onClick={onRetry}>{retryLabel}</button> : null}</div></section>;
}

function NodeIcon({ kind }: { kind: ExpeditionNode["kind"] }) { const Icon = NODE_ICONS[kind]; return <span className={`expedition-detail-icon ${kind}`}><Icon size={21} /></span>; }
function NodeState({ state, t }: { state: ExpeditionNode["state"]; t: (key: MessageKey) => string }) { return <em className={`expedition-state ${state}`}>{state === "complete" ? t("expedition.stateComplete") : state === "active" ? t("expedition.stateActive") : state === "hidden" ? t("expedition.stateHidden") : t("expedition.stateAvailable")}</em>; }
function nodeKindKey(kind: ExpeditionNode["kind"]): MessageKey { return kind === "discovery" ? "expedition.kindDiscovery" : kind === "mission" ? "expedition.kindMission" : kind === "together" ? "expedition.kindTogether" : "expedition.kindCreation"; }
function formatNumber(value: number, locale: string): string { return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(value); }
function openNode(node: ExpeditionNode, callbacks: { onOpenChallenge?: (id: string) => void; onOpenFeed?: () => void; onOpenTeams?: () => void; onOpenWishes?: () => void; onOpenBlog?: () => void }) {
  if (node.kind === "mission" && node.sourceId) callbacks.onOpenChallenge?.(node.sourceId);
  else if (node.kind === "discovery") callbacks.onOpenFeed?.();
  else if (node.kind === "together") callbacks.onOpenTeams?.();
  else if (node.sourceView === "goals.notes") callbacks.onOpenWishes?.();
  else if (callbacks.onOpenBlog) callbacks.onOpenBlog();
  else callbacks.onOpenFeed?.();
}
