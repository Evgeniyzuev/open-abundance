"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Backpack } from "lucide-react";
import { ChestIcon, DailyChestCard, useChestState } from "@/components/DailyChests";
import PathStarMap from "@/components/PathStarMap";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { selectJourneyChallenge, type JourneyChallenge } from "@/lib/journeyAction";
import { LIFE_STORAGE, LIFE_SPHERES, type LifeAnswers, type LifeLook } from "@/lib/lifeChoices";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { buildTrail, nextTrailStep, pathUi, type TrailNode } from "@/lib/pathTrail";
import { buildStarMap, type MapItem, type Star } from "@/lib/starMap";
import { trackProductEvent } from "@/lib/productAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { calculateWishJourney, PRIMARY_WISH_CHANGED_EVENT, readPrimaryWish, type PrimaryWishSummary } from "@/lib/wishJourney";

type PathChallenge = JourneyChallenge & { path_order?: number | null; core_reward_amount?: number | null };
type CallsPayload = {
  available?: boolean;
  mine?: Array<{ id: string; status: string; reward: number; call: { kind: "call" | "mission"; title: string; baseReward: number } | null }>;
  missions?: Array<{ id: string; baseReward: number }>;
};
type MapPayload = { wishes?: Array<MapItem & { done: boolean }>; caught?: MapItem[]; own?: MapItem[]; notes?: MapItem[] };
type StoredLife = { look?: LifeLook; answers?: LifeAnswers; main?: { sphere?: string } | null };

function readLife(): StoredLife | null {
  try {
    const raw = window.localStorage.getItem(LIFE_STORAGE.result);
    return raw ? (JSON.parse(raw) as StoredLife) : null;
  } catch {
    return null;
  }
}

/**
 * «Путь»: Home as one trail to the main wish (docs/PATH_EXPERIENCE.md). The wish on top, the trail of quests, calls,
 * sealed missions and the chest in the middle, one next step under it. A tap on a point shows its properties.
 */
export default function PathHome({ active, refreshNonce, onOpenChallenge, onOpenNextChallenge, onOpenCalls, onOpenWishes, onOpenWish, onOpenNotes, onOpenFeed, onOpenCore, onOpenNova }: {
  active: boolean;
  refreshNonce: number;
  onOpenChallenge: (id: string) => void;
  onOpenNextChallenge: () => void;
  onOpenCalls: () => void;
  onOpenWishes: () => void;
  onOpenWish: (id: string) => void;
  onOpenNotes: () => void;
  onOpenFeed: (tab: "feed" | "blog") => void;
  onOpenCore: () => void;
  onOpenNova: () => void;
}) {
  const { core, locale, money, user, wallet } = useUserContext();
  const ui = (key: Parameters<typeof pathUi>[0], values?: Record<string, string | number>) => pathUi(key, locale, values);
  const [rows, setRows] = useState<PathChallenge[] | null>(null);
  const [calls, setCalls] = useState<CallsPayload | null>(null);
  const [wish, setWish] = useState<PrimaryWishSummary | null>(null);
  const [life, setLife] = useState<StoredLife | null>(null);
  const [mapData, setMapData] = useState<MapPayload | null>(null);
  const [selected, setSelected] = useState<Star | null>(null);
  const [chestOpen, setChestOpen] = useState(false);
  const router = useRouter();
  const { state: chest } = useChestState(refreshNonce);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    void fetchWithSupabaseAuth(`/api/challenges?auth=required&ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { challenges?: PathChallenge[] } | null) => { if (!cancelled) setRows(payload?.challenges ?? []); })
      .catch(() => { if (!cancelled) setRows([]); });
    const sphere = readLife()?.main?.sphere;
    void fetchWithSupabaseAuth(`/api/word-calls?locale=${locale}${sphere ? `&sphere=${sphere}` : ""}`, { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: CallsPayload | null) => { if (!cancelled) setCalls(payload); })
      .catch(() => undefined);
    void fetchWithSupabaseAuth("/api/path/map", { cache: "no-store" }, { authRequired: true })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: MapPayload | null) => { if (!cancelled) setMapData(payload ?? {}); })
      .catch(() => { if (!cancelled) setMapData({}); });
    return () => { cancelled = true; };
  }, [active, userId, locale, refreshNonce]);

  // Leaving Home (a tab, Back) closes its sheets, so they do not wait on a hidden screen.
  useEffect(() => {
    if (active) return;
    setSelected(null);
    setChestOpen(false);
  }, [active]);

  useEffect(() => {
    const sync = () => { setWish(readPrimaryWish(userId ?? undefined)); setLife(readLife()); };
    sync();
    window.addEventListener(PRIMARY_WISH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRIMARY_WISH_CHANGED_EVENT, sync);
  }, [userId]);

  const nodes = useMemo(() => {
    if (!rows) return [];
    const level = core?.level ?? 0;
    const current = selectJourneyChallenge(rows, level);
    const title = (row: PathChallenge) => row.title?.[locale] ?? row.title?.en ?? "";
    return buildTrail({
      quests: rows.map((row) => ({ id: row.id, title: title(row), status: row.user_challenge_status ?? null, pathOrder: row.path_order ?? null, reward: row.core_reward_amount ?? null, eligible: true })),
      currentQuestId: current?.id ?? null,
      calls: calls?.available ? (calls.mine ?? []).filter((entry) => entry.call).map((entry) => ({ id: entry.id, title: entry.call!.title, kind: entry.call!.kind, status: entry.status, reward: entry.call!.baseReward })) : [],
      sealed: calls?.available ? (calls.missions ?? []).map((mission) => ({ id: mission.id, reward: mission.baseReward })) : [],
      chestOpenable: Boolean(chest?.openable),
      chestTitle: ui("kind.chest")
    });
    // ui depends only on locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, calls, chest?.openable, core?.level, locale]);

  const map = useMemo(() => buildStarMap({
    goal: { id: wish?.id ?? null, title: wish?.title ?? ui("chooseWish"), image: wish?.image_url ?? null },
    trail: nodes,
    wishes: mapData?.wishes ?? [],
    caught: mapData?.caught ?? [],
    own: mapData?.own ?? [],
    notes: mapData?.notes ?? []
    // ui depends only on locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [nodes, mapData, wish?.id, wish?.title, wish?.image_url, locale]);
  const mapLabels = useMemo(() => {
    const labels: Record<string, string> = { aria: ui("mapAria") };
    for (const id of ["path", "calls", "wishes", "caught", "own", "notes"] as const) {
      labels[`cluster.${id}`] = ui(`cluster.${id}`);
      labels[`fog.${id}`] = ui(`fog.${id}`);
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  const next = nextTrailStep(nodes);
  const journey = calculateWishJourney({ coreBalance: core?.balance ?? 0, reinvestPercent: core?.reinvest_percent ?? 100, targetAmount: wish?.target_amount ?? null, walletBalance: wallet?.balance ?? 0 });
  const progress = journey.targetAmount ? Math.min(100, (journey.savedAmount / journey.targetAmount) * 100) : 0;
  const sphere = life?.main?.sphere ? LIFE_SPHERES.find((item) => item.key === life.main?.sphere) : null;

  if (!user) return null;

  function act(node: TrailNode) {
    trackProductEvent("path_step_opened", { kind: node.kind, state: node.state });
    // The open sheet's history entry is taken over by the next screen (writeNavigationStateToHistory), so one Back
    // from there returns here.
    setSelected(null);
    if (node.kind === "chest") setChestOpen(true);
    else if (node.kind === "task") onOpenChallenge(node.ref);
    else onOpenCalls();
  }

  /** The one action of a star on the map. */
  function actStar(star: Star) {
    trackProductEvent("path_star_opened", { kind: star.kind, state: star.state });
    setSelected(null);
    if (star.kind === "task" || (star.kind === "fog" && star.cluster === "path")) return onOpenChallenge(star.ref);
    if (star.kind === "chest") return setChestOpen(true);
    if (star.kind === "call" || star.kind === "mission" || star.kind === "sealed") return onOpenCalls();
    if (star.kind === "goal") return onOpenWishes();
    if (star.kind === "wish") return onOpenWish(star.ref);
    if (star.kind === "caught" || star.kind === "own") return router.push(`/d/${star.ref}`);
    if (star.kind === "note") return onOpenNotes();
    // A fog star opens the place where that kind of star is made.
    if (star.ref === "calls") return onOpenCalls();
    if (star.ref === "wishes") return onOpenWishes();
    if (star.ref === "caught") return onOpenFeed("feed");
    if (star.ref === "own") return onOpenFeed("blog");
    if (star.ref === "notes") return onOpenNotes();
  }

  const starKind = (star: Star) => (star.kind === "fog" ? (star.cluster === "path" ? "kind.task" : `cluster.${star.ref}`) : `kind.${star.kind}`) as Parameters<typeof pathUi>[0];
  const starTitle = (star: Star) => star.kind === "sealed" ? ui("sealedTitle") : star.kind === "chest" ? ui("chestTitle") : star.kind === "fog" && star.cluster !== "path" ? ui(`fog.${star.ref}` as Parameters<typeof pathUi>[0]) : star.title;
  const starAction = (star: Star) => (
    star.kind === "task" || (star.kind === "fog" && star.cluster === "path") ? "go"
      : star.kind === "chest" ? "goChest"
        : star.kind === "sealed" ? "goSealed"
          : star.kind === "call" || star.kind === "mission" ? "goCall"
            : star.kind === "goal" || star.kind === "wish" ? "goWish"
              : star.kind === "caught" || star.kind === "own" ? "goPost"
                : star.kind === "note" ? "goNote" : "goExplore"
  ) as Parameters<typeof pathUi>[0];

  return (
    <section className="path-home" aria-label={ui("myWish")}>
      <button className="path-destination" type="button" onClick={onOpenWishes}>
        {/* eslint-disable-next-line @next/next/no-img-element -- wish covers come from any host the person chose */}
        {wish?.image_url ? <img className="path-destination-cover" alt="" src={wish.image_url} /> : null}
        <span className="path-eyebrow">{ui("myWish")}{wish && sphere ? ` · ${sphere.title[locale === "ru" ? "ru" : "en"]}` : ""}</span>
        <strong>{wish?.title ?? ui("chooseWish")}</strong>
        {journey.targetAmount ? (
          <>
            <span className="path-bar"><b style={{ width: `${progress}%` }} /></span>
            <small>{ui("toGoal", { saved: formatRoundedMoney(journey.savedAmount, locale), target: formatRoundedMoney(journey.targetAmount, locale) })}</small>
          </>
        ) : null}
      </button>

      <div className="path-map-wrap">
        <button className="path-nova" type="button" aria-label={ui("nova")} onClick={onOpenNova}>
          <Image src="/nova-fox-robot.webp" alt="" width={40} height={40} />
        </button>
        <PathStarMap
          map={map}
          labels={mapLabels}
          ui={{ zoomIn: ui("zoomIn"), zoomOut: ui("zoomOut"), reset: ui("resetView"), expand: ui("expandMap"), collapse: ui("collapseMap") }}
          onSelect={(star) => { trackProductEvent("path_star_tapped", { kind: star.kind }); setSelected(star); }}
        />
        <p className="path-map-hint">{ui("mapHint")}</p>
      </div>

      <div className="path-next">
        <span className="path-eyebrow">{ui("next")}{next ? ` · ${ui(`kind.${next.kind}`)}` : ""}</span>
        <strong>{next ? (next.kind === "sealed" ? ui("sealedTitle") : next.kind === "chest" ? ui("chestTitle") : next.title) : ui("nothing")}</strong>
        {next?.reward ? <span className="path-chip">{ui("reward", { amount: money.format(next.reward) })}</span> : null}
        <button className="challenge-primary-action" type="button" onClick={() => (next ? act(next) : onOpenNextChallenge())}>
          {next ? ui(next.kind === "chest" ? "goChest" : next.kind === "sealed" ? "goSealed" : next.kind === "task" ? "go" : "goCall") : ui("pickNext")}<ArrowRight size={17} />
        </button>
      </div>

      <button className="path-backpack" type="button" onClick={onOpenCore}>
        <span><Backpack size={18} aria-hidden="true" />{ui("backpack")}</span>
        <span>Core · {money.format(core?.balance ?? 0)}</span>
      </button>

      {selected ? (
        <Sheet backCloses title={ui(starKind(selected))} closeLabel="×" onClose={() => setSelected(null)}>
          <div className="path-props">
            {/* eslint-disable-next-line @next/next/no-img-element -- wish covers come from any host the person chose */}
            {selected.image ? <img className="path-props-cover" alt="" src={selected.image} /> : null}
            {["task", "call", "mission", "sealed", "chest", "fog"].includes(selected.kind) ? <span className="path-eyebrow">{ui(`state.${selected.state}` as Parameters<typeof pathUi>[0])}</span> : null}
            <strong>{starTitle(selected)}</strong>
            {selected.reward ? <span className="path-chip">{ui("reward", { amount: money.format(selected.reward) })}</span> : null}
            {selected.state !== "done" || selected.kind === "wish" || selected.kind === "task" ? (
              <button className="challenge-primary-action" type="button" onClick={() => actStar(selected)}>
                {ui(starAction(selected))}<ArrowRight size={17} />
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {chestOpen ? (
        <Sheet backCloses title={ui("kind.chest")} closeLabel="×" onClose={() => setChestOpen(false)}>
          <div className="path-props"><ChestIcon size={40} /><DailyChestCard inline refreshKey={refreshNonce} /></div>
        </Sheet>
      ) : null}
    </section>
  );
}
