"use client";

import { ArrowRight, ArrowUp, Backpack, BookOpen, Check, Compass, Gem, MapPin, RefreshCw, Sparkles, Users, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  futureDestinations: Array<{ id: string; title: string; description: string; imageUrl: string | null }>;
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
      setSelectedNodeId((current) => current && next.nodes.some((node) => node.id === current && node.state !== "complete") ? current : null);
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

  const selectedNode = payload?.nodes.find((node) => node.id === selectedNodeId && node.state !== "complete") ?? null;
  const nodes = payload?.nodes ?? [];
  const completedNodeCount = nodes.filter((node) => node.state === "complete").length;
  const routeProgressPercent = nodes.length > 0 ? Math.round((completedNodeCount / nodes.length) * 100) : 0;

  return (
    <section className="expedition-screen">
      <header className="expedition-header">
        <div><span>{t("expedition.kicker")}</span><h1>{t("expedition.title")}</h1></div>
        <button className="finance-small-icon-button" type="button" aria-label={t("app.common.refresh")} onClick={() => void loadExpedition()}><RefreshCw size={17} /></button>
      </header>

      <section className="expedition-destination">
        <div className="expedition-destination-head">
          <div className="expedition-destination-icon"><MapPin size={25} /></div>
          <div className="expedition-destination-copy"><span>{t("expedition.destinationLabel")}</span><h2>{payload?.destination?.title ?? t("expedition.openDestination")}</h2></div>
          {onOpenWishes ? <button className="text-button" type="button" onClick={onOpenWishes}>{t("expedition.changeDestination")}</button> : null}
        </div>
        <p className="expedition-destination-description">{payload?.destination?.description ?? t("expedition.destinationEmpty")}</p>
      </section>

      <section className="expedition-progress" aria-label={t("expedition.progressAria")}>
        <div><span>{t("expedition.level", { level: payload?.unlocks.coreLevel ?? 1 })}</span><strong>{formatNumber(payload?.unlocks.coreBalance ?? 0, locale)} Core</strong></div>
        <div><span>{t("expedition.availableRewards")}</span><strong>{formatNumber(payload?.unlocks.availableCore ?? 0, locale)} Core</strong></div>
        <div><span>{t("expedition.finds")}</span><strong>{payload?.unlocks.artifacts.length ?? 0}</strong></div>
      </section>

      <div className="expedition-map-heading"><div><span>{t("expedition.routeLabel")}</span><h2>{t("expedition.chooseRoute")}</h2></div><small>{t("expedition.routeScrollHint")}</small></div>
      {status === "offline" ? <p className="home-status">{t("home.offline")}</p> : null}

      {nodes.length > 0 || payload?.futureDestinations.length ? <ExpeditionRouteMap
        nodes={nodes}
        futureDestinations={payload?.futureDestinations ?? []}
        currentLevel={payload?.unlocks.coreLevel ?? 1}
        destination={payload?.destination ?? null}
        progressPercent={routeProgressPercent}
        completedNodeCount={completedNodeCount}
        locale={locale}
        t={t}
        onSelect={setSelectedNodeId}
        onOpenWishes={onOpenWishes}
      /> : <div className="expedition-empty-route"><Compass size={26} /><p>{t("expedition.noNodes")}</p></div>}

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

function ExpeditionRouteMap({
  nodes,
  futureDestinations,
  currentLevel,
  destination,
  progressPercent,
  completedNodeCount,
  locale,
  t,
  onSelect,
  onOpenWishes
}: {
  nodes: ExpeditionNode[];
  futureDestinations: Array<{ id: string; title: string; description: string; imageUrl: string | null }>;
  currentLevel: number;
  destination: ExpeditionPayload["destination"];
  progressPercent: number;
  completedNodeCount: number;
  locale: string;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onSelect: (id: string | null) => void;
  onOpenWishes?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentAnchorRef = useRef<HTMLDivElement>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const completedNodes = nodes.filter((node) => node.state === "complete");
  const openNodes = nodes.filter((node) => node.state !== "complete");
  const futureRoute = [...futureDestinations].reverse();

  useEffect(() => {
    const scroll = scrollRef.current;
    const currentAnchor = currentAnchorRef.current;
    if (!scroll || !currentAnchor) return;
    scroll.scrollTop = Math.max(0, currentAnchor.offsetTop - scroll.clientHeight * 0.36);
  }, [currentLevel, destination?.id, futureDestinations.length]);

  const togglePoint = (key: string, selectId?: string) => {
    const nextKey = expandedKey === key ? null : key;
    setExpandedKey(nextKey);
    onSelect(nextKey && selectId ? selectId : null);
  };

  return <section className="expedition-route-map" aria-label={t("expedition.nodesAria")}>
    <div className="expedition-route-scroll" ref={scrollRef} tabIndex={0}>
      <div className="expedition-map-canvas">
        <div className="expedition-map-scrim" aria-hidden="true" />
        <svg className="expedition-map-path" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true">
          <path d="M54 1000 C18 920 82 855 43 775 C9 705 88 640 54 555 C26 487 78 422 42 345 C12 280 88 190 49 105 C35 73 50 30 46 0" />
        </svg>

        {futureRoute.length ? <section className="expedition-map-section expedition-map-future-section">
          <div className="expedition-map-section-heading"><span>{t("expedition.futureDirections")}</span><small>{t("expedition.futureDirectionHint")}</small></div>
          <div className="expedition-map-continuation" aria-label={t("expedition.futureDirections")}>
            <span className="expedition-map-continuation-arrow" aria-hidden="true"><ArrowUp size={17} /></span>
            <div className="expedition-map-signposts">
              {futureRoute.map((futureDestination, index) => <span className="expedition-map-signpost" key={`sign-${futureDestination.id}`} title={futureDestination.title}>
                <ArrowUp size={12} aria-hidden="true" />
                <b>{currentLevel + futureRoute.length - index}</b>
                <em>{futureDestination.title}</em>
              </span>)}
            </div>
          </div>
          {futureRoute.map((futureDestination, index) => {
            const key = `future:${futureDestination.id}`;
            return <ExpeditionDestinationNode key={futureDestination.id} destination={futureDestination} level={currentLevel + futureRoute.length - index} position={mapPosition(index)} t={t} expanded={expandedKey === key} onToggle={() => togglePoint(key)} onOpenWishes={onOpenWishes} />;
          })}
        </section> : null}

        <section className="expedition-map-section expedition-map-current-section" ref={currentAnchorRef}>
          <div className="expedition-map-stops">
            {openNodes.map((node, index) => {
              const key = `node:${node.id}`;
              return <ExpeditionRouteNode key={node.id} node={node} locale={locale} t={t} position={mapPosition(index + futureRoute.length)} expanded={expandedKey === key} onToggle={() => togglePoint(key, node.id)} />;
            })}
            {!openNodes.length ? <div className="expedition-map-empty"><Compass size={20} /><span>{t("expedition.noNodes")}</span></div> : null}
          </div>
        </section>

        <section className="expedition-map-section expedition-map-completed-section">
          <div className="expedition-map-section-heading"><span>{t("expedition.completedRoute")}</span><small>{completedNodes.length} {t("expedition.stepsCompleted")}</small></div>
          <div className="expedition-map-level completed">
            <button className={`expedition-map-point-button current completed${expandedKey === "current" ? " selected" : ""}`} type="button" aria-label={`${t("expedition.currentLevel")}: ${currentLevel}`} aria-expanded={expandedKey === "current"} onClick={() => togglePoint("current")}>
              <span className="expedition-map-point-icon"><MapPin size={20} /></span>
              <small className="expedition-map-point-number">{currentLevel}</small>
            </button>
            {expandedKey === "current" ? <div className="expedition-map-popover current">
              <small>{t("expedition.currentLevel")}</small>
              <strong>{destination?.title ?? t("expedition.openDestination")}</strong>
              {destination?.description ? <p>{destination.description}</p> : null}
              <div className="expedition-route-progress" aria-label={t("expedition.routeProgress")}><span style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} /></div>
              <em>{completedNodeCount} {t("expedition.stepsCompleted")}</em>
            </div> : null}
          </div>
          {completedNodes.length ? <div className="expedition-map-stops">
            {completedNodes.map((node, index) => {
              const key = `node:${node.id}`;
              return <ExpeditionRouteNode key={node.id} node={node} locale={locale} t={t} position={mapPosition(index + openNodes.length)} expanded={expandedKey === key} onToggle={() => togglePoint(key)} />;
            })}
          </div> : null}
        </section>
      </div>
    </div>
  </section>;
}

function ExpeditionDestinationNode({ destination, level, position, expanded, t, onToggle, onOpenWishes }: { destination: { id: string; title: string; description: string; imageUrl: string | null }; level: number; position: "left" | "center" | "right"; expanded: boolean; t: (key: MessageKey, values?: Record<string, string | number>) => string; onToggle: () => void; onOpenWishes?: () => void }) {
  return <div className={`expedition-map-point ${position}${expanded ? " expanded" : ""}`}>
    <button className={`expedition-map-point-button destination${expanded ? " selected" : ""}`} type="button" aria-label={`${t("expedition.futureLevel", { level })}: ${destination.title}`} aria-expanded={expanded} onClick={onToggle}>
      <span className="expedition-map-point-icon"><Gem size={19} /></span>
      <small className="expedition-map-point-number">{level}</small>
    </button>
    {expanded ? <div className="expedition-map-popover destination">
      <small>{t("expedition.futureLevel", { level })}</small>
      <strong>{destination.title}</strong>
      <p>{destination.description}</p>
      {onOpenWishes ? <button className="text-button" type="button" onClick={onOpenWishes}>{t("expedition.changeDestination")}</button> : null}
    </div> : null}
  </div>;
}

function ExpeditionRouteNode({ node, locale, t, position, expanded, onToggle }: { node: ExpeditionNode; locale: string; t: (key: MessageKey, values?: Record<string, string | number>) => string; position: "left" | "center" | "right"; expanded: boolean; onToggle: () => void }) {
  const Icon = NODE_ICONS[node.kind];
  const stateLabel = node.state === "active" ? t("expedition.stateActive") : node.state === "complete" ? t("expedition.stateComplete") : node.state === "hidden" ? t("expedition.stateHidden") : t("expedition.stateAvailable");
  return <div className={`expedition-map-point ${position} ${node.kind} ${node.state}${expanded ? " expanded" : ""}`}>
    <button className={`expedition-map-point-button node ${node.kind} ${node.state}${expanded ? " selected" : ""}`} type="button" aria-label={`${t(nodeKindKey(node.kind))}: ${node.title}`} aria-expanded={expanded} onClick={onToggle}>
      <span className="expedition-map-point-icon"><Icon size={18} /></span>
    </button>
    {expanded ? <div className="expedition-map-popover node">
      <small>{t(nodeKindKey(node.kind))} · {stateLabel}</small>
      <strong>{node.title}</strong>
      <p>{node.description}</p>
      {node.reward ? <em>+{formatNumber(node.reward.core, locale)} Core · {node.reward.progressPercent}%</em> : null}
    </div> : null}
  </div>;
}

function mapPosition(index: number): "left" | "center" | "right" {
  return index % 3 === 1 ? "right" : index % 3 === 2 ? "center" : "left";
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
