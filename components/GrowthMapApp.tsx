"use client";

import { Compass, Heart, Navigation, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";

type GrowthMapAppProps = {
  active: boolean;
  refreshNonce: number;
};

type LevelThreshold = Pick<Tables<"level_thresholds">, "level" | "core_required" | "title">;
type MapWish = Omit<Pick<Tables<"wishes">, "id" | "title" | "description" | "target_amount" | "target_currency" | "difficulty_level" | "status">, "difficulty_level"> & {
  difficulty_level: number | null;
};
type MapStatus = "loading" | "ready" | "unauthenticated" | "offline" | "error";

const NODE_X = [50, 29, 70, 42, 73, 31];
const NODE_GAP = 126;
const NODE_TOP = 72;
const VISIBLE_LEVEL_COUNT = 6;

export default function GrowthMapApp({ active, refreshNonce }: GrowthMapAppProps) {
  const { core, loading: userLoading, locale, t, user } = useUserContext();
  const [levels, setLevels] = useState<LevelThreshold[]>([]);
  const [wishes, setWishes] = useState<MapWish[]>([]);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMap() {
      if (!active || userLoading) return;
      if (!user) {
        setLevels([]);
        setWishes([]);
        setStatus("unauthenticated");
        return;
      }

      if (!navigator.onLine) {
        setStatus((current) => current === "ready" ? current : "offline");
        return;
      }

      setStatus((current) => current === "ready" ? current : "loading");

      try {
        const supabase = getBrowserSupabaseClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          if (mounted) setStatus("unauthenticated");
          return;
        }

        const [wishResponse, thresholdsResult] = await Promise.all([
          fetch(`/api/wishes?status=all&includeRecommended=false&ts=${Date.now()}`, {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Cache-Control": "no-cache"
            }
          }),
          supabase
            .from("level_thresholds")
            .select("level,core_required,title")
            .order("level", { ascending: true })
        ]);

        const wishPayload = (await wishResponse.json()) as { wishes?: MapWish[]; error?: string };
        if (!wishResponse.ok || wishPayload.error) throw new Error(wishPayload.error ?? "Failed to load wishes.");
        if (thresholdsResult.error) throw new Error(thresholdsResult.error.message);
        if (!mounted) return;

        setWishes((wishPayload.wishes ?? []).filter((wish) => wish.status === "active"));
        setLevels(thresholdsResult.data ?? []);
        setStatus("ready");
      } catch (loadError) {
        if (!mounted) return;
        setStatus((current) => current === "ready" ? current : "error");
        console.warn("Growth map load failed", loadError);
      }
    }

    void loadMap();
    return () => {
      mounted = false;
    };
  }, [active, refreshNonce, user, userLoading]);

  const currentLevel = core?.level ?? 0;
  const currentBalance = core?.balance ?? 0;
  const visibleLevels = useMemo(() => {
    if (levels.length === 0) return [];

    const currentIndex = levels.findIndex((level) => level.level >= Math.max(1, currentLevel));
    const start = Math.max(0, (currentIndex < 0 ? levels.length - 1 : currentIndex) - 2);
    return levels.slice(start, Math.min(levels.length, start + VISIBLE_LEVEL_COUNT));
  }, [currentLevel, levels]);

  useEffect(() => {
    if (visibleLevels.length === 0) return;
    if (selectedLevel !== null && visibleLevels.some((level) => level.level === selectedLevel)) return;
    const current = visibleLevels.find((level) => level.level === currentLevel);
    setSelectedLevel((current ?? visibleLevels[0]).level);
  }, [currentLevel, selectedLevel, visibleLevels]);

  const selectedThreshold = levels.find((level) => level.level === selectedLevel) ?? null;
  const selectedWishes = wishes.filter((wish) => wish.difficulty_level === selectedLevel);
  const nextLevel = levels.find((level) => level.level > currentLevel) ?? null;
  const progress = nextLevel && nextLevel.core_required > 0
    ? Math.min(100, Math.round((currentBalance / nextLevel.core_required) * 100))
    : 100;
  const boardHeight = Math.max(530, visibleLevels.length * NODE_GAP + 40);
  const topVisibleLevel = visibleLevels[visibleLevels.length - 1]?.level ?? null;
  const edgeWishes = wishes.filter((wish) => {
    const wishLevel = wish.difficulty_level;
    const levelIsUnknown = wishLevel === null || !Number.isFinite(wishLevel) || !levels.some((level) => level.level === wishLevel);
    const levelIsBeyondVisibleMap = topVisibleLevel !== null && wishLevel !== null && wishLevel > topVisibleLevel;
    return levelIsUnknown || levelIsBeyondVisibleMap;
  });
  const nodes = visibleLevels.map((level, index) => ({
    level,
    x: NODE_X[index % NODE_X.length],
    y: boardHeight - NODE_TOP - index * NODE_GAP
  }));
  const routePath = nodes.map((node, index) => `${index === 0 ? "M" : "L"} ${node.x * 3.6} ${node.y}`).join(" ");

  if (status === "unauthenticated") {
    return (
      <section className="growth-map-screen">
        <MapHeader t={t} />
        <div className="growth-map-empty">
          <Compass size={38} />
          <strong>{t("map.authTitle")}</strong>
          <p>{t("map.authDescription")}</p>
        </div>
      </section>
    );
  }

  if (status === "loading" && levels.length === 0) {
    return (
      <section className="growth-map-screen">
        <MapHeader t={t} />
        <div className="growth-map-empty"><RefreshCw className="growth-map-spin" size={28} />{t("map.loading")}</div>
      </section>
    );
  }

  if (status === "error" && levels.length === 0) {
    return (
      <section className="growth-map-screen">
        <MapHeader t={t} />
        <div className="growth-map-empty">
          <strong>{t("map.error")}</strong>
          <p>{t("map.errorDescription")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="growth-map-screen">
      <MapHeader t={t} />

      <section className="growth-map-summary">
        <div className="growth-map-summary-copy">
          <span>{t("map.currentLevel")}</span>
          <strong>{currentLevel || "—"}</strong>
        </div>
        <div className="growth-map-summary-progress">
          <div className="growth-map-progress-head">
            <span>{nextLevel ? t("map.nextLevel", { level: nextLevel.level }) : t("map.maxLevel")}</span>
            <b>{progress}%</b>
          </div>
          <div className="growth-map-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>{nextLevel ? `${formatAdaptiveMoney(Math.max(0, nextLevel.core_required - currentBalance), locale)} ${t("map.coreRemaining")}` : t("map.summitReached")}</small>
        </div>
      </section>

      <section className="growth-map-board" style={{ minHeight: `${boardHeight}px` }} aria-label={t("map.routeAria")}>
        <svg className="growth-map-route" viewBox={`0 0 360 ${boardHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="growth-map-route-shadow" d={routePath} />
          <path className="growth-map-route-line" d={routePath} />
        </svg>
        <div className="growth-map-fog" aria-hidden="true">
          <span>☁️</span><span>☁️</span><span>☁️</span>
        </div>
        {edgeWishes.length > 0 ? (
          <div className="growth-map-edge-wishes" aria-label={t("map.offMapWishes")}>
            {edgeWishes.map((wish) => (
                <div className="growth-map-edge-wish" key={wish.id} role="note">
                  <span className="growth-map-edge-wish-arrow" aria-hidden="true">↑</span>
                  <Heart size={14} />
                  <strong>{wish.title}</strong>
                  <small>{wish.difficulty_level !== null ? t("map.level", { level: wish.difficulty_level }) : t("map.levelUnknown")}</small>
                </div>
            ))}
          </div>
        ) : null}
        <div className="growth-map-level-layer">
          {nodes.map((node) => {
            const biome = getBiome(node.level.level);
            const nodeWishes = wishes.filter((wish) => wish.difficulty_level === node.level.level);
            const isCurrent = node.level.level === currentLevel;
            const isPast = node.level.level < currentLevel;

            return (
              <button
                className={`growth-map-node ${biome.tone}${isCurrent ? " current" : ""}${isPast ? " past" : ""}`}
                key={node.level.level}
                style={{ left: `${node.x}%`, top: `${node.y}px` }}
                type="button"
                onClick={() => setSelectedLevel(node.level.level)}
              >
                <span className="growth-map-node-icon" aria-hidden="true">
                  {isCurrent ? <Navigation className="growth-map-current-marker" size={28} fill="currentColor" /> : biome.icon}
                </span>
                <span className="growth-map-node-copy">
                  <small>{isCurrent ? t("map.youAreHere") : t("map.level", { level: node.level.level })}</small>
                  <strong>{t(biome.nameKey)}</strong>
                  {nodeWishes[0] ? <em><Heart size={13} />{nodeWishes[0].title}{nodeWishes.length > 1 ? ` +${nodeWishes.length - 1}` : ""}</em> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedThreshold ? (
        <section className="growth-map-detail">
          <div className="growth-map-detail-header">
            <div>
              <span>{getBiome(selectedThreshold.level).icon} {t("map.level", { level: selectedThreshold.level })}</span>
              <h2>{t(getBiome(selectedThreshold.level).nameKey)}</h2>
            </div>
          </div>
          <p className="growth-map-detail-status">
            {selectedThreshold.level === currentLevel
              ? t("map.selectedCurrent")
              : selectedThreshold.level < currentLevel
                ? t("map.selectedPast")
                : t("map.selectedFuture")}
          </p>
          <div className="growth-map-detail-metrics">
            <span><strong>{formatAdaptiveMoney(selectedThreshold.core_required, locale)}</strong><small>{t("map.coreRequired")}</small></span>
            <span><strong>{selectedThreshold.level > currentLevel ? formatAdaptiveMoney(Math.max(0, selectedThreshold.core_required - currentBalance), locale) : "✓"}</strong><small>{selectedThreshold.level > currentLevel ? t("map.coreRemaining") : t("map.completed")}</small></span>
          </div>
          <div className="growth-map-wish-list">
            <h3>{t("map.wishesTitle")}</h3>
            {selectedWishes.length > 0 ? selectedWishes.map((wish) => (
              <div className="growth-map-wish" key={wish.id}>
                <Heart size={17} />
                <span><strong>{wish.title}</strong><small>{wish.target_amount ? formatWishAmount(wish.target_amount, wish.target_currency, locale) : t("map.wishNoAmount")}</small></span>
              </div>
            )) : <p>{t("map.noWishes")}</p>}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function MapHeader({ t }: { t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  return (
    <header className="growth-map-header">
      <div>
        <span>{t("map.kicker")}</span>
        <h1>{t("map.title")}</h1>
      </div>
      <Compass size={28} aria-hidden="true" />
    </header>
  );
}

function formatWishAmount(amount: number, currency: string, locale: "ru" | "en"): string {
  if (currency === "USD") return formatAdaptiveMoney(amount, locale);
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

function getBiome(level: number): { icon: string; nameKey: MessageKey; tone: string } {
  if (level <= 3) return { icon: "🌱", nameKey: "map.biome.meadows", tone: "meadows" };
  if (level <= 6) return { icon: "🌲", nameKey: "map.biome.forest", tone: "forest" };
  if (level <= 9) return { icon: "⛰️", nameKey: "map.biome.mountains", tone: "mountains" };
  return { icon: "🏔️", nameKey: "map.biome.summits", tone: "summits" };
}
