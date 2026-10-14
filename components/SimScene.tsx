import { SimFigure } from "@/components/SimAvatar";
import type { FutureDay } from "@/lib/futureDay";
import { SIM_CLOTHES, SIM_SCENE_SLOTS, type SimOutfit } from "@/lib/simWardrobe";

/** The figure with its surroundings: a home behind on the left, a pet and a ride on the right, one ground line. */
export default function SimScene({ photoUrl, outfit, day }: { photoUrl?: string | null; outfit: SimOutfit; day?: FutureDay }) {
  const surroundings = SIM_SCENE_SLOTS
    .map((slot) => SIM_CLOTHES.find((item) => item.id === outfit[slot] && item.slot === slot))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <svg viewBox="0 0 300 150" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <g transform="translate(92 0)"><SimFigure photoUrl={photoUrl} outfit={outfit} mood={day?.mood} /></g>
    </svg>
  );
}
