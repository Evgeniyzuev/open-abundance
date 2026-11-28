// «Путь» as a star map (founder 2026-11-28, docs/PATH_EXPERIENCE.md): the main wish is the bright centre, the quest
// trail is a constellation leading to it, and the person's other things (calls, wishes, what caught them, their own
// posts, quick notes) are constellations around it. Places not opened yet are fog stars that say how to open them.
// Pure, so scripts/verify-star-map-contract.mjs runs it directly; components/PathStarMap.tsx draws it.

import type { TrailNode } from "./pathTrail";

export type StarKind = "goal" | "task" | "call" | "mission" | "sealed" | "chest" | "wish" | "caught" | "own" | "note" | "fog";
export type StarState = "done" | "current" | "open" | "ahead" | "fog";
export type ClusterId = "path" | "calls" | "wishes" | "caught" | "own" | "notes";

export type Star = {
  id: string;
  kind: StarKind;
  state: StarState;
  cluster: ClusterId | null;
  title: string;
  /** challenge id, call entry id, wish id, post id, note id, "chest" or the cluster a fog star opens. */
  ref: string;
  reward: number | null;
  x: number;
  y: number;
  /** Radius in world units before zoom. */
  r: number;
  image?: string | null;
};

export type StarLink = { a: string; b: string; bright: boolean };
export type Cluster = { id: ClusterId; x: number; y: number; empty: boolean };
export type StarMap = { stars: Star[]; links: StarLink[]; clusters: Cluster[]; radius: number };

export type MapItem = { id: string; title: string; done?: boolean; image?: string | null };
export type StarMapInput = {
  goal: { id: string | null; title: string; image?: string | null };
  trail: TrailNode[];
  wishes: MapItem[];
  caught: MapItem[];
  own: MapItem[];
  notes: MapItem[];
};

/** Where each constellation sits around the goal (degrees, 0 = right, 90 = down). The trail comes up from below. */
const CLUSTER_ANGLE: Record<Exclude<ClusterId, "path">, number> = { calls: 25, notes: -35, wishes: -95, caught: 205, own: 150 };
const CLUSTER_DISTANCE = 190;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function seeded(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return ((value >>> 0) % 10_000) / 10_000;
}

/** A small constellation around (cx, cy): golden-angle spiral with a stable per-star jitter. */
function spiral(ids: string[], cx: number, cy: number, spacing = 46): Array<{ x: number; y: number }> {
  return ids.map((id, index) => {
    if (index === 0) return { x: cx, y: cy };
    const angle = index * GOLDEN + seeded(id) * 0.6;
    const distance = spacing * Math.sqrt(index) * (0.85 + seeded(`${id}:d`) * 0.3);
    return { x: Math.round(cx + Math.cos(angle) * distance), y: Math.round(cy + Math.sin(angle) * distance) };
  });
}

/** Links each star to its nearest earlier star: a tree, which reads as a constellation. */
function constellation(stars: Star[], bright: boolean): StarLink[] {
  const links: StarLink[] = [];
  for (let index = 1; index < stars.length; index += 1) {
    let best = stars[0];
    let bestDistance = Infinity;
    for (let other = 0; other < index; other += 1) {
      const distance = Math.hypot(stars[other].x - stars[index].x, stars[other].y - stars[index].y);
      if (distance < bestDistance) { best = stars[other]; bestDistance = distance; }
    }
    links.push({ a: best.id, b: stars[index].id, bright });
  }
  return links;
}

export function buildStarMap(input: StarMapInput): StarMap {
  const stars: Star[] = [];
  const links: StarLink[] = [];
  const clusters: Cluster[] = [];
  const goal: Star = { id: "goal", kind: "goal", state: "current", cluster: null, title: input.goal.title, ref: input.goal.id ?? "", reward: null, x: 0, y: 0, r: 16, image: input.goal.image ?? null };
  stars.push(goal);

  // The trail: quests from the oldest shown done step (far below) up to the goal, gently winding.
  const path = input.trail.filter((node) => !node.side);
  const pathStars: Star[] = path.map((node, index) => {
    const t = path.length > 1 ? index / (path.length - 1) : 0;
    const y = Math.round(90 + (1 - t) * Math.max(160, path.length * 62));
    const x = Math.round(Math.sin(index * 1.3 + 0.5) * 70);
    const fog = node.state === "ahead";
    return { id: node.id, kind: fog ? "fog" : "task", state: fog ? "fog" : node.state, cluster: "path", title: node.title, ref: node.ref, reward: node.reward, x, y, r: node.state === "current" ? 11 : 7 };
  });
  stars.push(...pathStars);
  for (let index = 1; index < pathStars.length; index += 1) {
    links.push({ a: pathStars[index - 1].id, b: pathStars[index].id, bright: pathStars[index].state !== "fog" });
  }
  if (pathStars.length) links.push({ a: pathStars[pathStars.length - 1].id, b: goal.id, bright: false });
  clusters.push({ id: "path", x: 0, y: pathStars.length ? Math.max(...pathStars.map((star) => star.y)) + 34 : 120, empty: pathStars.length === 0 });

  // The chest sits beside the current quest (or the goal).
  const current = pathStars.find((star) => star.state === "current") ?? goal;
  if (input.trail.some((node) => node.kind === "chest")) {
    stars.push({ id: "chest", kind: "chest", state: "open", cluster: "path", title: input.trail.find((node) => node.kind === "chest")?.title ?? "", ref: "chest", reward: null, x: current.x + 52, y: current.y - 18, r: 9 });
    links.push({ a: current.id, b: "chest", bright: true });
  }

  const around = (id: Exclude<ClusterId, "path">, items: Array<Omit<Star, "x" | "y" | "cluster">>) => {
    const angle = (CLUSTER_ANGLE[id] * Math.PI) / 180;
    // Bigger constellations sit further out, so they never reach the trail or the goal.
    const distance = CLUSTER_DISTANCE + 46 * Math.sqrt(Math.max(1, items.length));
    const cx = Math.round(Math.cos(angle) * distance);
    const cy = Math.round(Math.sin(angle) * distance);
    const list = items.length ? items : [{ id: `fog:${id}`, kind: "fog" as const, state: "fog" as const, title: "", ref: id, reward: null, r: 8 }];
    const placed = spiral(list.map((item) => item.id), cx, cy).map((spot, index) => ({ ...list[index], cluster: id, x: spot.x, y: spot.y }));
    stars.push(...placed);
    links.push(...constellation(placed, items.length > 0));
    clusters.push({ id, x: cx, y: cy, empty: items.length === 0 });
  };

  around("calls", input.trail.filter((node) => node.side && node.kind !== "chest").map((node) => ({
    id: node.id, kind: node.kind === "sealed" ? "sealed" : node.kind === "mission" ? "mission" : "call", state: node.state, title: node.title, ref: node.ref, reward: node.reward, r: node.kind === "sealed" ? 7 : 8
  })));
  around("wishes", input.wishes.filter((wish) => wish.id !== input.goal.id).slice(0, 12).map((wish) => ({
    id: `w:${wish.id}`, kind: "wish", state: wish.done ? "done" : "open", title: wish.title, ref: wish.id, reward: null, r: 8, image: wish.image ?? null
  })));
  around("caught", input.caught.slice(0, 14).map((post) => ({ id: `p:${post.id}`, kind: "caught", state: "open", title: post.title, ref: post.id, reward: null, r: 6 })));
  around("own", input.own.slice(0, 12).map((post) => ({ id: `o:${post.id}`, kind: "own", state: "open", title: post.title, ref: post.id, reward: null, r: 7 })));
  around("notes", input.notes.slice(0, 10).map((note) => ({ id: `n:${note.id}`, kind: "note", state: "open", title: note.title, ref: note.id, reward: null, r: 6 })));

  const radius = Math.max(...stars.map((star) => Math.hypot(star.x, star.y))) + 40;
  return { stars, links, clusters, radius };
}

export type Camera = { x: number; y: number; zoom: number; angle: number };

/** World point to screen point for a viewport `width` x `height`; the camera looks at (x, y), turned by `angle`. */
export function project(camera: Camera, width: number, height: number, point: { x: number; y: number }): { x: number; y: number } {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const cos = Math.cos(camera.angle);
  const sin = Math.sin(camera.angle);
  return { x: width / 2 + (dx * cos - dy * sin) * camera.zoom, y: height / 2 + (dx * sin + dy * cos) * camera.zoom };
}

export function unproject(camera: Camera, width: number, height: number, point: { x: number; y: number }): { x: number; y: number } {
  const sx = (point.x - width / 2) / camera.zoom;
  const sy = (point.y - height / 2) / camera.zoom;
  const cos = Math.cos(-camera.angle);
  const sin = Math.sin(-camera.angle);
  return { x: camera.x + sx * cos - sy * sin, y: camera.y + sx * sin + sy * cos };
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/** The star under a tap: the nearest one within `slop` screen pixels of its drawn edge, or null. */
export function hitStar(map: StarMap, camera: Camera, width: number, height: number, tap: { x: number; y: number }, slop = 18): Star | null {
  let best: Star | null = null;
  let bestDistance = Infinity;
  for (const star of map.stars) {
    const spot = project(camera, width, height, star);
    const distance = Math.hypot(spot.x - tap.x, spot.y - tap.y) - star.r * camera.zoom;
    if (distance <= slop && distance < bestDistance) { best = star; bestDistance = distance; }
  }
  return best;
}

/** The first view: the current step and the goal both on screen, upright. */
export function startCamera(map: StarMap, width: number, height: number): Camera {
  const current = map.stars.find((star) => star.state === "current" && star.kind === "task") ?? map.stars[0];
  const x = current.x / 2;
  const y = current.y / 2;
  // Wide enough that the nearest constellations show around the trail: there is more to explore.
  const span = Math.max(380, (Math.abs(current.y) + 160) / 0.62);
  return { x, y, zoom: clampZoom(Math.min(width, height) / span), angle: 0 };
}

/** Zoom by `factor` keeping the world point under the screen point `at` in place. */
export function zoomAt(camera: Camera, width: number, height: number, at: { x: number; y: number }, factor: number): Camera {
  const before = unproject(camera, width, height, at);
  const next = { ...camera, zoom: clampZoom(camera.zoom * factor) };
  const after = unproject(next, width, height, at);
  return { ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y };
}

/** Move the view so the screen moves by (dx, dy) pixels. */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  const cos = Math.cos(-camera.angle);
  const sin = Math.sin(-camera.angle);
  const wx = (dx * cos - dy * sin) / camera.zoom;
  const wy = (dx * sin + dy * cos) / camera.zoom;
  return { ...camera, x: camera.x - wx, y: camera.y - wy };
}

/** Turn the view by `delta` radians around the screen point `at`. */
export function rotateAt(camera: Camera, width: number, height: number, at: { x: number; y: number }, delta: number): Camera {
  const before = unproject(camera, width, height, at);
  const next = { ...camera, angle: camera.angle + delta };
  const after = unproject(next, width, height, at);
  return { ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y };
}
