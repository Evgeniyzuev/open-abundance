"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { coreTreeGrowth, coreTreeShape, spiralPoints } from "@/lib/coreTree";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

const WIDTH = 220;
const GROUND = 184;
const CENTER = WIDTH / 2;
const FED_MS = 2000;
const SPARKS = Array.from({ length: 9 }, (_, index) => ({ x: (index - 4) * 13 + (index % 2 ? 4 : -3), delay: (index % 4) * 90, rise: 70 + (index % 3) * 26 }));

const LEAF = "M0 0 C3 -5 9 -6 12 -2 C8 1 3 2 0 0 Z";
const PETALS = [0, 72, 144, 216, 288].map((angle) => ({ angle, x: Math.round(240 * Math.cos((angle * Math.PI) / 180)) / 100, y: Math.round(240 * Math.sin((angle * Math.PI) / 180)) / 100 }));

/**
 * The Core tree: a sprout at level 0 that grows into an apple tree with fruit by level 20 and keeps
 * growing past the frame after that. Its size follows the level and the progress to the next one.
 * A Core top-up sends a wave of energy through it: the picture zooms in, rings spread from the
 * crown, sparks rise from the roots and the tree shakes. It only reads the balance.
 */
export default function CoreTree({ level, balance, nextThreshold, locale, t }: { level: number; balance: number; nextThreshold?: number | null; locale: AppLocale; t: TFunction }) {
  const [fed, setFed] = useState<{ id: number; amount: number } | null>(null);
  const previousBalance = useRef(balance);
  const fedId = useRef(0);
  const auraId = `core-tree-aura-${useId().replace(/:/g, "")}`;

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
  // A darker back layer gives a big crown depth.
  const backClusters = shape.crownRadius > 30 ? spiralPoints(Math.ceil(shape.leaves * 0.5), shape.crownRadius * 0.95, 0.9) : [];
  const blossoms = spiralPoints(shape.blossoms, shape.crownRadius * 0.82, 1.3);
  const fruits = spiralPoints(shape.fruits, shape.crownRadius * 0.85, 0.6);
  const bend = shape.trunkHeight * 0.06;
  const trunk = `M${CENTER} ${GROUND} C${CENTER - bend} ${GROUND - shape.trunkHeight * 0.4} ${CENTER + bend} ${GROUND - shape.trunkHeight * 0.7} ${CENTER} ${top}`;
  const crownTop = shape.crownRadius ? crownY - shape.crownRadius * 0.8 - clusterRadius : top - 16;
  // The picture is as tall as the tree, so a sprout takes a small card and the card grows with it.
  // Wide crowns are not scaled down: they spill over the sides of the frame.
  const viewTop = Math.round(Math.min(GROUND - 70, crownTop - 14));
  const stageName = t(`coreTree.stage.${shape.stage}` as MessageKey);

  return (
    <section className={`core-tree${fed ? " is-fed" : ""}`} aria-label={t("coreTree.label")}>
      <div className="core-tree-head">
        <strong>{stageName}</strong>
        {fed ? (
          <span className="core-tree-gain" key={fed.id}>{t("coreTree.gain", { amount: formatAdaptiveMoney(fed.amount, locale) })}</span>
        ) : (
          <span>
            {shape.nextStage && shape.nextStageLevel !== null
              ? t("coreTree.next", { stage: t(`coreTree.stage.${shape.nextStage}` as MessageKey), level: shape.nextStageLevel })
              : t("coreTree.full")}
          </span>
        )}
      </div>
      <div className="core-tree-scene">
        <svg viewBox={`0 ${viewTop} ${WIDTH} ${200 - viewTop}`} role="img" aria-label={t("coreTree.aria", { stage: stageName, level })}>
          <defs>
            <radialGradient id={auraId}>
              <stop offset="0%" stopColor="#fde68a" stopOpacity=".55" />
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
          </defs>
          {shape.grandeur > 0 ? <circle className="core-tree-aura" cx={CENTER} cy={crownY} r={shape.crownRadius * (1.2 + 0.4 * shape.grandeur)} fill={`url(#${auraId})`} style={{ opacity: 0.35 + 0.65 * shape.grandeur }} /> : null}
          <ellipse className="core-tree-ground" cx={CENTER} cy={GROUND + 4} rx={40 + shape.crownRadius} ry="7" />
          {Array.from({ length: shape.groundFruits }, (_, index) => (
            <circle className="core-tree-ground-fruit" key={`ground-${index}`} cx={CENTER + (index % 2 ? 1 : -1) * (18 + index * 11)} cy={GROUND + 3 - (index % 3)} r={shape.fruitRadius * 0.9} />
          ))}
          <g className="core-tree-plant" style={{ transformOrigin: `${CENTER}px ${GROUND}px` }}>
            {Array.from({ length: shape.roots }, (_, index) => {
              const side = index % 2 === 0 ? -1 : 1;
              const reach = 10 + index * 6 + shape.trunkWidth;
              return <path className="core-tree-trunk" key={`root-${index}`} d={`M${CENTER} ${GROUND - 2} Q${CENTER + side * reach * 0.5} ${GROUND} ${CENTER + side * reach} ${GROUND + 3}`} strokeWidth={Math.max(1.2, shape.trunkWidth * 0.35)} />;
            })}
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
              {backClusters.map((point, index) => (
                <circle className="core-tree-cluster is-back" key={`back-${index}`} cx={CENTER + point.x} cy={crownY - 6 + point.y * 0.75} r={clusterRadius * 1.05} />
              ))}
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
                <g className="core-tree-fruit" key={`fruit-${index}`} transform={`translate(${CENTER + point.x} ${crownY + point.y * 0.8 + 4})`}>
                  <path className="core-tree-fruit-stem" d={`M0 ${-shape.fruitRadius + 0.5} l1 -3`} />
                  <circle r={shape.fruitRadius} />
                  <circle className="core-tree-fruit-shine" cx={-shape.fruitRadius * 0.32} cy={-shape.fruitRadius * 0.32} r={shape.fruitRadius * 0.26} />
                </g>
              ))}
            </g>
          </g>
          {fed ? (
            <g className="core-tree-energy" key={`energy-${fed.id}`} aria-hidden="true">
              {[0, 1, 2].map((ring) => (
                <circle className="core-tree-wave" key={ring} cx={CENTER} cy={shape.crownRadius ? crownY : top} r={Math.max(14, shape.crownRadius * 0.4)} style={{ animationDelay: `${ring * 180}ms`, "--wave": 2.6 + shape.crownRadius / 40 } as React.CSSProperties} />
              ))}
              {SPARKS.map((spark, index) => (
                <circle className="core-tree-spark" key={index} cx={CENTER + spark.x * (0.6 + shape.crownRadius / 90)} cy={GROUND - 4} r="2.2" style={{ animationDelay: `${spark.delay}ms`, "--rise": `${-(spark.rise + shape.trunkHeight * 0.6)}px` } as React.CSSProperties} />
              ))}
            </g>
          ) : null}
          {fed ? (
            <path key={fed.id} className="core-tree-drop" style={{ "--fall": `${GROUND - 10 - viewTop}px` } as React.CSSProperties} d={`M${CENTER} ${viewTop - 6} c0 0 -4 6 -4 9 a4 4 0 0 0 8 0 c0 -3 -4 -9 -4 -9 Z`} />
          ) : null}
        </svg>
      </div>
    </section>
  );
}
