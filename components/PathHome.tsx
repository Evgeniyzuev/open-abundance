"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Backpack, Check, Flame, KeyRound, Lock, Star } from "lucide-react";
import { ChestIcon, DailyChestCard, useChestState } from "@/components/DailyChests";
import { LifeCharacter } from "@/components/LifeChoices";
import Sheet from "@/components/ui/Sheet";
import { useUserContext } from "@/components/UserProvider";
import { selectJourneyChallenge, type JourneyChallenge } from "@/lib/journeyAction";
import { LIFE_STORAGE, LIFE_SPHERES, lifeStats, type LifeAnswers, type LifeLook } from "@/lib/lifeChoices";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { buildTrail, layoutTrail, nextTrailStep, pathUi, type TrailNode } from "@/lib/pathTrail";
import { trackProductEvent } from "@/lib/productAnalytics";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { calculateWishJourney, PRIMARY_WISH_CHANGED_EVENT, readPrimaryWish, type PrimaryWishSummary } from "@/lib/wishJourney";

type PathChallenge = JourneyChallenge & { path_order?: number | null; core_reward_amount?: number | null };
type CallsPayload = {
  available?: boolean;
  mine?: Array<{ id: string; status: string; reward: number; call: { kind: "call" | "mission"; title: string; baseReward: number } | null }>;
  missions?: Array<{ id: string; baseReward: number }>;
};
type StoredLife = { look?: LifeLook; answers?: LifeAnswers; main?: { sphere?: string } | null };

const KIND_COLOR: Record<TrailNode["kind"], string> = { task: "var(--path-task)", call: "var(--path-call)", mission: "var(--path-call)", sealed: "var(--path-seal)", chest: "var(--path-chest)" };

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
export default function PathHome({ active, refreshNonce, onOpenChallenge, onOpenNextChallenge, onOpenCalls, onOpenWishes, onOpenCore, onOpenNova }: {
  active: boolean;
  refreshNonce: number;
  onOpenChallenge: (id: string) => void;
  onOpenNextChallenge: () => void;
  onOpenCalls: () => void;
  onOpenWishes: () => void;
  onOpenCore: () => void;
  onOpenNova: () => void;
}) {
  const { core, locale, money, user, wallet } = useUserContext();
  const ui = (key: Parameters<typeof pathUi>[0], values?: Record<string, string | number>) => pathUi(key, locale, values);
  const [rows, setRows] = useState<PathChallenge[] | null>(null);
  const [calls, setCalls] = useState<CallsPayload | null>(null);
  const [wish, setWish] = useState<PrimaryWishSummary | null>(null);
  const [life, setLife] = useState<StoredLife | null>(null);
  const [selected, setSelected] = useState<TrailNode | null>(null);
  const [chestOpen, setChestOpen] = useState(false);
  const [width, setWidth] = useState(340);
  const boxRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(Math.max(260, Math.min(520, box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

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

  const layout = useMemo(() => layoutTrail(nodes, width), [nodes, width]);
  const next = nextTrailStep(nodes);
  const journey = calculateWishJourney({ coreBalance: core?.balance ?? 0, reinvestPercent: core?.reinvest_percent ?? 100, targetAmount: wish?.target_amount ?? null, walletBalance: wallet?.balance ?? 0 });
  const progress = journey.targetAmount ? Math.min(100, (journey.savedAmount / journey.targetAmount) * 100) : 0;
  const sphere = life?.main?.sphere ? LIFE_SPHERES.find((item) => item.key === life.main?.sphere) : null;
  const current = layout.points.find((point) => point.node.state === "current") ?? layout.points.find((point) => !point.node.side && point.node.state === "done");

  if (!user) return null;

  function act(node: TrailNode) {
    trackProductEvent("path_step_opened", { kind: node.kind, state: node.state });
    const go = () => {
      if (node.kind === "chest") setChestOpen(true);
      else if (node.kind === "task") onOpenChallenge(node.ref);
      else onOpenCalls();
    };
    if (!selected) return go();
    // The open sheet holds a history entry: let its Back land first, then move on, so no stray entry is left behind
    // (otherwise Back from the quest needed two presses to reach Home).
    let done = false;
    const run = () => { if (done) return; done = true; window.removeEventListener("popstate", run); window.setTimeout(go, 0); };
    window.addEventListener("popstate", run);
    window.setTimeout(run, 400);
    setSelected(null);
  }

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

      <div className="path-map" ref={boxRef}>
        <button className="path-nova" type="button" aria-label={ui("nova")} onClick={onOpenNova}>
          <Image src="/nova-fox-robot.webp" alt="" width={40} height={40} />
        </button>
        <svg width={width} height={layout.height} viewBox={`0 0 ${width} ${layout.height}`} aria-hidden="true">
          <path d={layout.path} fill="none" stroke="var(--path-trail)" strokeWidth={10} strokeLinecap="round" strokeDasharray="1 16" />
          {layout.donePath ? <path d={layout.donePath} fill="none" stroke="var(--path-task)" strokeWidth={5} strokeLinecap="round" opacity={0.5} /> : null}
        </svg>
        <span className="path-goal-star" style={{ left: layout.goal.x, top: layout.goal.y }} aria-hidden="true"><Star size={16} /></span>
        {layout.points.map(({ node, x, y }) => (
          <button
            key={node.id}
            className={`path-node ${node.kind} ${node.state}${node.side ? " side" : ""}`}
            type="button"
            style={{ left: x, top: y, ["--node" as string]: KIND_COLOR[node.kind] }}
            aria-label={`${ui(`kind.${node.kind}`)}: ${node.title || ui("sealedTitle")}`}
            onClick={() => setSelected(node)}
          >
            {node.state === "done" ? <Check size={15} /> : node.kind === "call" || node.kind === "mission" ? <Flame size={16} /> : node.kind === "sealed" ? <Lock size={14} /> : node.kind === "chest" ? <KeyRound size={15} /> : null}
          </button>
        ))}
        {current && current.node.state === "current" ? (
          <span className="path-label" style={{ left: Math.min(width * 0.7, Math.max(width * 0.3, current.x)), top: current.y }}>{current.node.title}</span>
        ) : null}
        {current && life?.look ? (
          <span className="path-hero" style={{ left: current.x, top: current.y }} aria-hidden="true">
            <LifeCharacter look={life.look} stats={lifeStats(life.answers ?? {})} size={46} />
          </span>
        ) : null}
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
        <Sheet backCloses title={ui(`kind.${selected.kind}`)} closeLabel="×" onClose={() => setSelected(null)}>
          <div className="path-props">
            <span className="path-eyebrow">{ui(`state.${selected.state}`)}</span>
            <strong>{selected.kind === "sealed" ? ui("sealedTitle") : selected.kind === "chest" ? ui("chestTitle") : selected.title}</strong>
            {selected.reward ? <span className="path-chip">{ui("reward", { amount: money.format(selected.reward) })}</span> : null}
            {selected.state !== "done" ? (
              <button className="challenge-primary-action" type="button" onClick={() => act(selected)}>
                {ui(selected.kind === "chest" ? "goChest" : selected.kind === "sealed" ? "goSealed" : selected.kind === "task" ? "go" : "goCall")}<ArrowRight size={17} />
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
