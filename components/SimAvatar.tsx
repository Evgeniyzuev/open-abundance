import type { FutureDayMood } from "@/lib/futureDay";
import { SIM_ARMS, SIM_CLOTHES, SIM_SCENE_SLOTS, effectivePose, type SimOutfit, type SimPose } from "@/lib/simWardrobe";

/** The mannequin and its worn clothes, drawn in a 100x150 box. Shared by the avatar and the scene. */
export function SimFigure({ photoUrl, outfit, mood = "idle", pose = "auto" }: { photoUrl?: string | null; outfit: SimOutfit; mood?: FutureDayMood; pose?: SimPose }) {
  const worn = Object.values(outfit)
    .map((id) => SIM_CLOTHES.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item) && !SIM_SCENE_SLOTS.includes(item!.slot));
  return (
    <>
      <defs><clipPath id="sim-head"><circle cx="50" cy="24" r="14" /></clipPath></defs>
      <path d="M34 46 H66 L64 92 H36 Z" />
      <path d={`${SIM_ARMS[effectivePose(pose, mood)]} M42 92 L40 138 M58 92 L60 138`} />
      <path d="M46 38 V46 M54 38 V46" />
      {photoUrl ? <image href={photoUrl} x="36" y="10" width="28" height="28" preserveAspectRatio="xMidYMid slice" clipPath="url(#sim-head)" /> : null}
      <circle cx="50" cy="24" r="14" />
      {worn.map((item) => item.paths.map((d, index) => <path key={`${item.id}${index}`} d={d} fill="currentColor" fillOpacity="0.18" />))}
    </>
  );
}

/**
 * The stylised "future me" figure: a line-art mannequin in the style of the item icons. The profile photo,
 * when there is one, sits in the head; clothes are translucent line-art layers on top of the body.
 */
export default function SimAvatar({ photoUrl, outfit, mood = "idle", pose = "auto" }: { photoUrl?: string | null; outfit: SimOutfit; mood?: FutureDayMood; pose?: SimPose }) {
  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <SimFigure photoUrl={photoUrl} outfit={outfit} mood={mood} pose={pose} />
    </svg>
  );
}
