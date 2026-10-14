import SacredItemIcon from "@/components/SacredItemIcon";
import { SimFigure } from "@/components/SimAvatar";
import type { FutureDay } from "@/lib/futureDay";
import { SIM_CLOTHES, SIM_SCENE_SLOTS, type SimOutfit, type SimPose } from "@/lib/simWardrobe";

const SHELF_ICON = 26;
const SHELF_STEP = 36;

/**
 * The figure with its surroundings: a home behind on the left, a pet and a ride on the right, one ground line,
 * and under it a shelf with the sacred items the person chose to show. The day moves the sun; the pet is sleepy
 * in the morning and happy when the day is done, and is never sad.
 */
export default function SimScene({ photoUrl, outfit, day, pose = "auto", shelf = [] }: {
  photoUrl?: string | null;
  outfit: SimOutfit;
  day?: FutureDay;
  pose?: SimPose;
  shelf?: string[];
}) {
  const surroundings = SIM_SCENE_SLOTS
    .map((slot) => SIM_CLOTHES.find((item) => item.id === outfit[slot] && item.slot === slot))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const hasPet = surroundings.some((item) => item.slot === "pet");
  const height = shelf.length ? 192 : 150;
  const shelfStart = (300 - shelf.length * SHELF_STEP) / 2 + (SHELF_STEP - SHELF_ICON) / 2;

  return (
    <svg viewBox={`0 0 300 ${height}`} width="100%" style={{ height: "auto" }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M0 146 H300" strokeWidth="1.8" opacity="0.5" />
      {day && day.planned > 0 ? (
        <>
          <circle cx={20 + 260 * day.ratio} cy={36 - 30 * Math.sin(Math.PI * day.ratio)} r="6" fill="currentColor" fillOpacity="0.25" />
          {day.mood === "celebrate" ? <path d="M60 18 v8 M56 22 h8 M236 30 v8 M232 34 h8 M150 8 v8 M146 12 h8" strokeWidth="1.8" /> : null}
        </>
      ) : null}
      {surroundings.map((item) => (
        <g key={item.id} transform={item.slot === "pet" && day?.mood === "celebrate" ? `translate(0 -6) ${item.place ?? ""}` : item.place}>
          {item.paths.map((d, index) => <path key={index} d={d} fill="currentColor" fillOpacity="0.1" />)}
        </g>
      ))}
      {hasPet && day?.mood === "morning" ? <path d="M196 100 h6 l-6 7 h6" strokeWidth="1.8" opacity="0.7" /> : null}
      {hasPet && day?.mood === "celebrate" ? <path d="M200 104 c-3 -5 -10 0 -5 5 l5 5 l5 -5 c5 -5 -2 -10 -5 -5 z" strokeWidth="1.8" fill="currentColor" fillOpacity="0.3" /> : null}
      <g transform="translate(92 0)"><SimFigure photoUrl={photoUrl} outfit={outfit} mood={day?.mood} pose={pose} /></g>
      {shelf.length ? (
        <>
          <path d={`M${shelfStart - 8} 184 H${shelfStart + shelf.length * SHELF_STEP - 4}`} strokeWidth="1.8" opacity="0.5" />
          {shelf.map((key, index) => <SacredItemIcon key={key} itemKey={key} size={SHELF_ICON} x={shelfStart + index * SHELF_STEP} y={154} />)}
        </>
      ) : null}
    </svg>
  );
}
