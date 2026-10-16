"use client";

import { useEffect, useRef, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { coreTreeGrowth, coreTreeShape, spiralPoints } from "@/lib/coreTree";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const WIDTH = 220;
const GROUND = 184;
const CENTER = WIDTH / 2;
const FED_MS = 1800;

const LEAF = "M0 0 C3 -5 9 -6 12 -2 C8 1 3 2 0 0 Z";
const PETALS = [0, 72, 144, 216, 288].map((angle) => ({ angle, x: Math.round(240 * Math.cos((angle * Math.PI) / 180)) / 100, y: Math.round(240 * Math.sin((angle * Math.PI) / 180)) / 100 }));

/**
 * The Core tree: a sprout at level 0 that grows into an apple tree with fruit by level 20. Its size
 * follows the level and the progress to the next one, and a Core top-up makes it shake, glow and
 * stretch for a moment. It only reads the balance; it changes no balance and no rate.
 */
export default function CoreTree({ level, balance, nextThreshold, locale, t }: { level: number; balance: number; nextThreshold?: number | null; locale: AppLocale; t: TFunction }) {
  const [fed, setFed] = useState<{ id: number; amount: number } | null>(null);
  const previousBalance = useRef(balance);
  const fedId = useRef(0);

  // A top-up, Afterburn, reinvestment or the daily accrual: the tree reacts to every rise of Core.
  useEffect(() => {
    const amount = balance - previousBalance.current;
    previousBalance.current = balance;
    if (!(amount > 0)) return;
    const id = ++fedId.current;
    setFed({ id, amount });
    const timer = window.setTimeout(() => setFed((current) => (current?.id === id ? null : current)), FED_MS);
    return () => window.clearTimeout(timer);
  }, [balance]);

  const shape = coreTreeShape(coreTreeGrowth({ level, balance, nextThreshold }));
  const top = GROUND - shape.trunkHeight;
  const crownY = top - shape.crownRadius * 0.3;
  const clusterRadius = Math.max(5, shape.crownRadius * 0.36);
  const clusters = spiralPoints(shape.leaves, Math.max(0, shape.crownRadius - clusterRadius * 0.6));
  const blossoms = spiralPoints(shape.blossoms, shape.crownRadius * 0.82, 1.3);
  const fruits = spiralPoints(shape.fruits, shape.crownRadius * 0.8, 0.6);
  const bend = shape.trunkHeight * 0.06;
  const trunk = `M${CENTER} ${GROUND} C${CENTER - bend} ${GROUND - shape.trunkHeight * 0.4} ${CENTER + bend} ${GROUND - shape.trunkHeight * 0.7} ${CENTER} ${top}`;
  // The picture is as tall as the tree, so a sprout takes a small card and the card grows with it.
  const viewTop = Math.round(Math.min(GROUND - 70, Math.max(0, crownY - shape.crownRadius * 0.8 - clusterRadius - 14, shape.crownRadius ? 0 : top - 30)));
  const stageName = t(`coreTree.stage.${shape.stage}` as MessageKey);

  return (
    <section className={`core-tree${fed ? " is-fed" : ""}`} aria-label={t("coreTree.label")}>
      <div className="core-tree-head">
        <strong>{stageName}</strong>
        <span>
          {shape.nextStage && shape.nextStageLevel !== null
            ? t("coreTree.next", { stage: t(`coreTree.stage.${shape.nextStage}` as MessageKey), level: shape.nextStageLevel })
            : t("coreTree.full")}
        </span>
      </div>
      <div className="core-tree-scene">
        <svg viewBox={`0 ${viewTop} ${WIDTH} ${200 - viewTop}`} role="img" aria-label={t("coreTree.aria", { stage: stageName, level })}>
          <ellipse className="core-tree-ground" cx={CENTER} cy={GROUND + 4} rx={40 + shape.crownRadius} ry="7" />
          <g className="core-tree-plant" style={{ transformOrigin: `${CENTER}px ${GROUND}px` }}>
            <path className="core-tree-trunk" d={trunk} strokeWidth={shape.trunkWidth} />
            {Array.from({ length: shape.branches }, (_, index) => {
              const side = index % 2 === 0 ? -1 : 1;
              const startY = GROUND - shape.trunkHeight * (0.5 + 0.42 * ((index + 1) / (shape.branches + 1)));
              const reach = shape.crownRadius * (0.55 + 0.25 * ((index % 3) / 2));
              return (
                <path
                  className="core-tree-trunk"
                  key={`branch-${index}`}
                  d={`M${CENTER} ${startY} Q${CENTER + side * reach * 0.4} ${startY - reach * 0.2} ${CENTER + side * reach} ${startY - reach * 0.55}`}
                  strokeWidth={Math.max(1.2, shape.trunkWidth * 0.45)}
                />
              );
            })}
            {Array.from({ length: shape.stemLeaves }, (_, index) => {
              const side = index % 2 === 0 ? 1 : -1;
              const y = top + 2 + index * Math.min(6, shape.trunkHeight / 5);
              return <path className="core-tree-leaf" key={`stem-${index}`} d={LEAF} transform={`translate(${CENTER} ${y}) scale(${side * (1.1 - index * 0.1)} 1) rotate(-20)`} />;
            })}
            <g className="core-tree-crown" style={{ transformOrigin: `${CENTER}px ${top}px` }}>
              {clusters.map((point, index) => (
                <circle className={`core-tree-cluster tone-${index % 3}`} key={`leaf-${index}`} cx={CENTER + point.x} cy={crownY + point.y * 0.8} r={clusterRadius} />
              ))}
              {blossoms.map((point, index) => (
                <g className="core-tree-blossom" key={`blossom-${index}`} transform={`translate(${CENTER + point.x} ${crownY + point.y * 0.8})`}>
                  {PETALS.map((petal) => <circle key={petal.angle} cx={petal.x} cy={petal.y} r="1.9" />)}
                  <circle className="core-tree-blossom-heart" r="1.2" />
                </g>
              ))}
              {fruits.map((point, index) => (
                <g className="core-tree-fruit" key={`fruit-${index}`} transform={`translate(${CENTER + point.x} ${crownY + point.y * 0.8 + 3})`}>
                  <path className="core-tree-fruit-stem" d="M0 -4 L1 -7" />
                  <circle r="4.6" />
                  <circle className="core-tree-fruit-shine" cx="-1.4" cy="-1.4" r="1.1" />
                </g>
              ))}
            </g>
          </g>
          {fed ? (
            <path key={fed.id} className="core-tree-drop" style={{ "--fall": `${GROUND - 10 - viewTop}px` } as React.CSSProperties} d={`M${CENTER} ${viewTop - 6} c0 0 -4 6 -4 9 a4 4 0 0 0 8 0 c0 -3 -4 -9 -4 -9 Z`} />
          ) : null}
        </svg>
        {fed ? <span className="core-tree-gain" key={fed.id}>{t("coreTree.gain", { amount: formatAdaptiveMoney(fed.amount, locale) })}</span> : null}
      </div>
    </section>
  );
}
