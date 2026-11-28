"use client";

import { Compass, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHistoryLayer } from "@/lib/historyLayer";
import { panBy, project, rotateAt, startCamera, zoomAt, hitStar, type Camera, type Star, type StarKind, type StarMap } from "@/lib/starMap";

// The «Путь» star map: drag to move, pinch to zoom, turn with two fingers (wheel / shift+wheel on a computer), tap a
// star to open it. Drawn on a canvas, always as a night sky; still frame when the person prefers reduced motion.

const COLOR: Record<StarKind, string> = {
  goal: "#ffd66b",
  task: "#7cc4ff",
  call: "#ff8a5c",
  mission: "#ff8a5c",
  sealed: "#c79bff",
  chest: "#ffc94d",
  wish: "#ff8fc8",
  caught: "#7ef0d0",
  own: "#a8f07e",
  note: "#ffe08a",
  fog: "#8a93b8"
};
const CLUSTER_COLOR: Record<string, string> = { path: "#7cc4ff", calls: "#ff8a5c", wishes: "#ff8fc8", caught: "#7ef0d0", own: "#a8f07e", notes: "#ffe08a" };

type Props = {
  map: StarMap;
  labels: Record<string, string>;
  ui: { zoomIn: string; zoomOut: string; reset: string; expand: string; collapse: string };
  onSelect: (star: Star) => void;
};

export default function PathStarMap({ map, labels, ui, onSelect }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [expanded, setExpanded] = useState(false);
  // Full screen is a layer: the system Back (or Escape) closes it.
  const closeExpanded = useHistoryLayer(expanded, () => setExpanded(false));
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeExpanded(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, closeExpanded]);
  const cameraRef = useRef<Camera | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; distance: number; angle: number } | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const backgroundRef = useRef<Array<{ x: number; y: number; r: number; a: number }>>([]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setSize({ width: Math.round(box.clientWidth), height: Math.round(box.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // A fresh first view when the map or the box changes size a lot (first load, full screen).
  useEffect(() => {
    if (!size.width) return;
    cameraRef.current = startCamera(map, size.width, size.height);
    backgroundRef.current = Array.from({ length: Math.round((size.width * size.height) / 2600) }, (_, index) => ({
      x: ((index * 7919) % 1000) / 1000 * size.width,
      y: ((index * 104729) % 1000) / 1000 * size.height,
      r: index % 9 === 0 ? 1.3 : 0.7,
      a: 0.25 + ((index * 31) % 50) / 100
    }));
    drawRef.current();
    // Only a new map or a new box size starts the view over.
  }, [map, size.width, size.height]);

  const draw = useCallback((time = 0) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera || !size.width) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    // Both sides: full screen changes the height alone, and a stale height left the lower half blank.
    if (canvas.width !== size.width * ratio || canvas.height !== size.height * ratio) { canvas.width = size.width * ratio; canvas.height = size.height * ratio; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { width, height } = size;

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#070a1c");
    sky.addColorStop(1, "#120a24");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    for (const dot of backgroundRef.current) {
      ctx.globalAlpha = dot.a * (0.75 + 0.25 * Math.sin(time / 900 + dot.x));
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Nebula glow behind each constellation.
    for (const cluster of map.clusters) {
      const spot = project(camera, width, height, cluster);
      const radius = (cluster.empty ? 70 : 140) * camera.zoom;
      const glow = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, radius);
      glow.addColorStop(0, `${CLUSTER_COLOR[cluster.id]}${cluster.empty ? "14" : "2e"}`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const byId = new Map(map.stars.map((star) => [star.id, star]));
    ctx.lineCap = "round";
    for (const link of map.links) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const pa = project(camera, width, height, a);
      const pb = project(camera, width, height, b);
      ctx.strokeStyle = link.bright ? `${COLOR[b.kind === "fog" ? a.kind : b.kind]}aa` : "rgba(160,170,210,0.28)";
      ctx.lineWidth = link.bright ? 1.6 : 1;
      ctx.setLineDash(link.bright ? [] : [3, 6]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const star of map.stars) {
      const spot = project(camera, width, height, star);
      if (spot.x < -40 || spot.y < -40 || spot.x > width + 40 || spot.y > height + 40) continue;
      const color = COLOR[star.kind];
      const pulse = star.state === "current" ? 1 + 0.18 * Math.sin(time / 400) : 1;
      const radius = Math.max(2.5, star.r * Math.min(1.6, Math.max(0.6, camera.zoom))) * pulse;
      const halo = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, radius * 3.2);
      halo.addColorStop(0, `${color}${star.kind === "fog" ? "33" : "88"}`);
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = star.kind === "fog" ? "rgba(138,147,184,0.55)" : star.state === "done" ? `${color}cc` : "#fff";
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (star.kind !== "fog") {
        ctx.strokeStyle = color;
        ctx.lineWidth = star.state === "current" || star.kind === "goal" ? 3 : 1.5;
        ctx.stroke();
      }
      if (star.kind === "fog" || star.kind === "sealed") {
        ctx.fillStyle = "#0b0f24";
        ctx.font = `700 ${Math.round(radius * 1.2)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", spot.x, spot.y + 0.5);
      }
      // Titles: the goal and the current step always, the rest once zoomed in.
      const showTitle = star.kind === "goal" || star.state === "current" || camera.zoom >= 1.4;
      const title = star.title || (star.kind === "fog" ? labels[`fog.${star.ref}`] ?? "" : "");
      if (showTitle && title) {
        ctx.font = `${star.kind === "goal" ? 700 : 600} ${star.kind === "goal" ? 14 : 12}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = star.kind === "fog" ? "rgba(200,206,235,0.75)" : "rgba(255,255,255,0.92)";
        // At most two short lines, so a long title never runs into a constellation name.
        // The goal's title sits above it: the trail comes in from below.
        const lines = wrapTitle(title, star.kind === "goal" ? 20 : 22);
        const lineHeight = star.kind === "goal" ? 17 : 15;
        const firstY = star.kind === "goal" ? spot.y - radius - 8 - lines.length * lineHeight : spot.y + radius + 6;
        lines.forEach((line, index) => ctx.fillText(line, spot.x, firstY + index * lineHeight));
      }
    }

    // Constellation names.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 11px system-ui, sans-serif";
    for (const cluster of map.clusters) {
      const label = labels[`cluster.${cluster.id}`];
      if (!label) continue;
      const spot = project(camera, width, height, cluster.id === "path" ? cluster : { x: cluster.x, y: cluster.y - 34 - (cluster.empty ? 0 : 40) });
      ctx.fillStyle = `${CLUSTER_COLOR[cluster.id]}dd`;
      ctx.fillText(label.toUpperCase(), spot.x, spot.y);
    }
  }, [labels, map, size]);

  useEffect(() => {
    drawRef.current = () => draw(performance.now());
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(0); return; }
    let frame = 0;
    const loop = (time: number) => { draw(time); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const tapStar = useRef<ReturnType<typeof hitStar>>(null);
  function onClick() {
    const star = tapStar.current;
    tapStar.current = null;
    if (star) onSelect(star);
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    tapStar.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const list = [...pointers.current.values()];
    if (list.length === 1) gesture.current = { moved: false, startX: point.x, startY: point.y, distance: 0, angle: 0 };
    if (list.length === 2 && gesture.current) {
      gesture.current.moved = true;
      gesture.current.distance = Math.hypot(list[1].x - list[0].x, list[1].y - list[0].y);
      gesture.current.angle = Math.atan2(list[1].y - list[0].y, list[1].x - list[0].x);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(event.pointerId);
    const camera = cameraRef.current;
    if (!previous || !camera || !gesture.current) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const list = [...pointers.current.values()];
    if (list.length === 1) {
      if (Math.hypot(point.x - gesture.current.startX, point.y - gesture.current.startY) > 6) gesture.current.moved = true;
      cameraRef.current = panBy(camera, point.x - previous.x, point.y - previous.y);
    } else if (list.length >= 2) {
      const [a, b] = list;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      let next = camera;
      // Each finger moving half of its step moves the middle point; follow it, then zoom and turn around it.
      next = panBy(next, (point.x - previous.x) / 2, (point.y - previous.y) / 2);
      if (gesture.current.distance > 0) next = zoomAt(next, size.width, size.height, mid, distance / gesture.current.distance);
      next = rotateAt(next, size.width, size.height, mid, angle - gesture.current.angle);
      gesture.current.distance = distance;
      gesture.current.angle = angle;
      cameraRef.current = next;
    }
    drawRef.current();
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = local(event);
    const wasTap = pointers.current.size === 1 && gesture.current && !gesture.current.moved;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      const camera = cameraRef.current;
      if (wasTap && camera) {
        const star = hitStar(map, camera, size.width, size.height, point);
        // Open the card on the click that follows, not here: on a phone that click comes after the card has
        // appeared and would land on its backdrop, closing it at once.
        tapStar.current = star ?? null;
      }
      gesture.current = null;
    } else if (gesture.current) {
      // One finger left after a pinch: keep moving with it, never read it as a tap.
      gesture.current.moved = true;
    }
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    const camera = cameraRef.current;
    if (!camera) return;
    const at = local(event);
    cameraRef.current = event.shiftKey
      ? rotateAt(camera, size.width, size.height, at, event.deltaY / 400)
      : zoomAt(camera, size.width, size.height, at, Math.exp(-event.deltaY / 400));
    drawRef.current();
  }

  // The page must not scroll while the wheel zooms the map.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = (event: WheelEvent) => event.preventDefault();
    canvas.addEventListener("wheel", stop, { passive: false });
    return () => canvas.removeEventListener("wheel", stop);
  }, []);

  const step = (factor: number) => {
    const camera = cameraRef.current;
    if (!camera) return;
    cameraRef.current = zoomAt(camera, size.width, size.height, { x: size.width / 2, y: size.height / 2 }, factor);
    drawRef.current();
  };

  // Keyboard: arrows move, +/- zoom, 0 resets.
  function onKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    const camera = cameraRef.current;
    if (!camera) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (moves[event.key]) cameraRef.current = panBy(camera, ...moves[event.key]);
    else if (event.key === "+" || event.key === "=") cameraRef.current = zoomAt(camera, size.width, size.height, { x: size.width / 2, y: size.height / 2 }, 1.25);
    else if (event.key === "-") cameraRef.current = zoomAt(camera, size.width, size.height, { x: size.width / 2, y: size.height / 2 }, 0.8);
    else if (event.key === "0") cameraRef.current = startCamera(map, size.width, size.height);
    else return;
    event.preventDefault();
    drawRef.current();
  }

  return (
    <div className={expanded ? "star-map expanded" : "star-map"} ref={boxRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        tabIndex={0}
        role="img"
        aria-label={labels.aria}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      <div className="star-map-tools">
        <button type="button" aria-label={ui.zoomIn} onClick={() => step(1.3)}><Plus size={18} /></button>
        <button type="button" aria-label={ui.zoomOut} onClick={() => step(1 / 1.3)}><Minus size={18} /></button>
        <button type="button" aria-label={ui.reset} onClick={() => { cameraRef.current = startCamera(map, size.width, size.height); drawRef.current(); }}><Compass size={18} /></button>
        <button type="button" aria-label={expanded ? ui.collapse : ui.expand} onClick={() => (expanded ? closeExpanded() : setExpanded(true))}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
      </div>
      {/* The same stars as a list, for screen readers and keyboards. */}
      <ul className="sr-only">
        {map.stars.filter((star) => star.title || star.kind === "fog").map((star) => (
          <li key={star.id}><button type="button" onClick={() => onSelect(star)}>{star.title || labels[`fog.${star.ref}`]}</button></li>
        ))}
      </ul>
    </div>
  );
}

function wrapTitle(title: string, width: number): string[] {
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  let used = 0;
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = "";
      if (lines.length === 2) break;
    }
    line = line ? `${line} ${word}` : word;
    used += 1;
  }
  if (lines.length < 2 && line) lines.push(line);
  const cut = (text: string) => (text.length > width ? `${text.slice(0, width - 1)}…` : text);
  const result = lines.map(cut);
  if (used < words.length && !result[result.length - 1].endsWith("…")) result[result.length - 1] = `${result[result.length - 1].slice(0, width - 1)}…`;
  return result;
}
