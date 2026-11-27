// «Путь» (founder 2026-11-27, docs/PATH_EXPERIENCE.md): Home as one trail to the main wish. Quests, calls, sealed
// missions and the chest become points on the trail; one next step is shown under it. Pure, so
// scripts/verify-path-trail-contract.mjs runs it directly.

export type TrailKind = "task" | "call" | "mission" | "sealed" | "chest";
export type TrailState = "done" | "current" | "open" | "ahead";

export type TrailNode = {
  id: string;
  kind: TrailKind;
  state: TrailState;
  title: string;
  /** challenge id, call entry id, sealed mission call id or "chest". */
  ref: string;
  reward: number | null;
  /** Side points (open calls, sealed missions, the chest) sit beside the trail, not on it. */
  side: boolean;
};

export type TrailQuest = { id: string; title: string; status: string | null; pathOrder: number | null; reward: number | null; eligible: boolean };
export type TrailCall = { id: string; title: string; kind: "call" | "mission"; status: string; reward: number | null };
export type TrailSealed = { id: string; reward: number | null };

export const DONE_SHOWN = 3;
export const AHEAD_SHOWN = 3;

const done = (status: string | null) => String(status ?? "").toLowerCase() === "completed";

/**
 * The trail from the bottom up: the last few done path quests, the current step, the next path quests (never the whole
 * length, founder 2026-10-25), and side points for open calls, today's sealed missions and an openable chest.
 */
export function buildTrail(input: { quests: TrailQuest[]; currentQuestId: string | null; calls: TrailCall[]; sealed: TrailSealed[]; chestOpenable: boolean; chestTitle?: string }): TrailNode[] {
  const path = input.quests.filter((quest) => quest.pathOrder !== null).sort((a, b) => (a.pathOrder ?? 0) - (b.pathOrder ?? 0));
  const finished = path.filter((quest) => done(quest.status)).slice(-DONE_SHOWN);
  const current = input.quests.find((quest) => quest.id === input.currentQuestId && !done(quest.status)) ?? null;
  const ahead = path.filter((quest) => !done(quest.status) && quest.id !== current?.id).slice(0, AHEAD_SHOWN);

  const nodes: TrailNode[] = finished.map((quest) => ({ id: `q:${quest.id}`, kind: "task", state: "done", title: quest.title, ref: quest.id, reward: quest.reward, side: false }));
  if (current) nodes.push({ id: `q:${current.id}`, kind: "task", state: "current", title: current.title, ref: current.id, reward: current.reward, side: false });

  for (const call of input.calls.filter((item) => item.status === "taken" || item.status === "submitted")) {
    nodes.push({ id: `c:${call.id}`, kind: call.kind === "mission" ? "mission" : "call", state: "open", title: call.title, ref: call.id, reward: call.reward, side: true });
  }
  if (input.chestOpenable) nodes.push({ id: "chest", kind: "chest", state: "open", title: input.chestTitle ?? "", ref: "chest", reward: null, side: true });
  for (const mission of input.sealed.slice(0, 2)) {
    nodes.push({ id: `s:${mission.id}`, kind: "sealed", state: "ahead", title: "", ref: mission.id, reward: mission.reward, side: true });
  }
  for (const quest of ahead) nodes.push({ id: `q:${quest.id}`, kind: "task", state: "ahead", title: quest.title, ref: quest.id, reward: quest.reward, side: false });
  return nodes;
}

/**
 * The one next step under the trail: an openable chest first (a reward moment in one tap), then a word already given,
 * then the current quest, then a sealed mission. Null when nothing is waiting.
 */
export function nextTrailStep(nodes: TrailNode[]): TrailNode | null {
  return nodes.find((node) => node.kind === "chest")
    ?? nodes.find((node) => (node.kind === "call" || node.kind === "mission") && node.state === "open")
    ?? nodes.find((node) => node.state === "current")
    ?? nodes.find((node) => node.kind === "sealed")
    ?? null;
}

export type TrailPoint = { node: TrailNode; x: number; y: number };

/**
 * Positions in a box `width` wide: main points wind up from the bottom, side points sit beside the main point before
 * them. Returns the points, the box height and the SVG path through the main points.
 */
export function layoutTrail(nodes: TrailNode[], width: number, step = 76): { points: TrailPoint[]; height: number; path: string; donePath: string; goal: { x: number; y: number } } {
  const main = nodes.filter((node) => !node.side);
  const center = width / 2;
  const amplitude = Math.min(90, width * 0.28);
  const top = 46;
  const rows = Math.max(1, main.length);
  const height = top + rows * step + 24;
  const mainPoints: TrailPoint[] = main.map((node, index) => ({
    node,
    x: Math.round(center + amplitude * Math.sin(index * 1.15 + 0.4)),
    y: Math.round(height - 34 - index * step)
  }));
  const destination = { x: Math.round(center + amplitude * Math.sin(rows * 1.15 + 0.4) * 0.5), y: 22 };

  const sidePoints: TrailPoint[] = [];
  let lastMain = mainPoints.find((point) => point.node.state === "current") ?? mainPoints[mainPoints.length - 1] ?? { x: center, y: height - 34 };
  let sideIndex = 0;
  for (const node of nodes) {
    if (!node.side) {
      const point = mainPoints.find((item) => item.node.id === node.id);
      if (point && point.node.state !== "done") { lastMain = point; sideIndex = 0; }
      continue;
    }
    // Side points stack up beside their anchor, on the roomier side, zig-zagging a little so they never overlap.
    const direction = lastMain.x > center ? -1 : 1;
    const offset = 64 + (sideIndex % 2) * 34;
    sidePoints.push({ node, x: Math.round(Math.min(width - 22, Math.max(22, lastMain.x + direction * offset))), y: Math.round(Math.max(20, lastMain.y - 6 - sideIndex * 42)) });
    sideIndex += 1;
  }

  const through = [...mainPoints.map((point) => ({ x: point.x, y: point.y })), destination];
  const lastDone = mainPoints.reduce((index, point, i) => (point.node.state === "done" || point.node.state === "current" ? i : index), -1);
  return { points: [...mainPoints, ...sidePoints], height, path: smoothPath(through), donePath: lastDone >= 1 ? smoothPath(through.slice(0, lastDone + 1)) : "", goal: destination };
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return "";
  let d = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const midY = (a.y + b.y) / 2;
    d += ` C${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.y}`;
  }
  return d;
}

/** The trail Home is turned on by /?path=1 (QA and the founder first) and off by /?path=0, remembered on the device. */
export function pathHomeEnabled(search: string, read: (key: string) => string | null, write: (key: string, value: string) => void): boolean {
  const flag = new URLSearchParams(search).get("path");
  if (flag === "1" || flag === "0") write(PATH_FLAG_KEY, flag);
  return (flag ?? read(PATH_FLAG_KEY)) === "1";
}

export const PATH_FLAG_KEY = "oa.pathHome";

type UiKey = "myWish" | "chooseWish" | "change" | "toGoal" | "next" | "nothing" | "pickNext" | "open" | "kind.task" | "kind.call" | "kind.mission" | "kind.sealed" | "kind.chest" | "state.done" | "state.current" | "state.open" | "state.ahead" | "sealedTitle" | "chestTitle" | "go" | "goCall" | "goSealed" | "goChest" | "more" | "moreHint" | "backpack" | "reward" | "nova";

const UI: Record<"ru" | "en", Record<UiKey, string>> = {
  ru: {
    myWish: "Моё желание", chooseWish: "Выбери желание, к которому идёшь", change: "Сменить", toGoal: "{saved} из {target}",
    next: "Следующий шаг", nothing: "На сегодня всё сделано", pickNext: "Выбрать следующее", open: "Подробнее",
    "kind.task": "Задание", "kind.call": "Вызов", "kind.mission": "Миссия", "kind.sealed": "Миссия-тайна", "kind.chest": "Сундук",
    "state.done": "пройдено", "state.current": "сейчас", "state.open": "слово дано", "state.ahead": "впереди",
    sealedTitle: "Запечатано. Суть откроется, когда согласишься", chestTitle: "Сундук ждёт ключа",
    go: "Открыть задание", goCall: "К вызову", goSealed: "Посмотреть миссии", goChest: "Открыть сундук",
    more: "Ещё на сегодня", moreHint: "Нова, встреча с лидом, цель дня, задачи, лента", backpack: "Рюкзак", reward: "+{amount} Core", nova: "Нова"
  },
  en: {
    myWish: "My wish", chooseWish: "Choose the wish you are walking to", change: "Change", toGoal: "{saved} of {target}",
    next: "Next step", nothing: "Everything for today is done", pickNext: "Pick the next one", open: "Details",
    "kind.task": "Quest", "kind.call": "Call", "kind.mission": "Mission", "kind.sealed": "Sealed mission", "kind.chest": "Chest",
    "state.done": "done", "state.current": "now", "state.open": "word given", "state.ahead": "ahead",
    sealedTitle: "Sealed. It opens once you agree", chestTitle: "A chest is waiting for its key",
    go: "Open the quest", goCall: "Go to the call", goSealed: "See the missions", goChest: "Open the chest",
    more: "More for today", moreHint: "Nova, lead meeting, daily goal, tasks, feed", backpack: "Backpack", reward: "+{amount} Core", nova: "Nova"
  }
};

export function pathUi(key: UiKey, locale: string, values: Record<string, string | number> = {}): string {
  const text = UI[locale === "ru" ? "ru" : "en"][key];
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text);
}
