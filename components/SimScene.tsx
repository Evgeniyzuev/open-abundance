import { SimFigure } from "@/components/SimAvatar";
import { SIM_CLOTHES, SIM_SCENE_SLOTS, type SimOutfit } from "@/lib/simWardrobe";

/** The figure with its surroundings: a home behind on the left, a pet and a ride on the right, one ground line. */
export default function SimScene({ photoUrl, outfit }: { photoUrl?: string | null; outfit: SimOutfit }) {
  const surroundings = SIM_SCENE_SLOTS
    .map((slot) => SIM_CLOTHES.find((item) => item.id === outfit[slot] && item.slot === slot))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <svg viewBox="0 0 300 150" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M0 146 H300" strokeWidth="1.8" opacity="0.5" />
      {surroundings.map((item) => (
        <g key={item.id} transform={item.place}>
          {item.paths.map((d, index) => <path key={index} d={d} fill="currentColor" fillOpacity="0.1" />)}
        </g>
      ))}
      <g transform="translate(92 0)"><SimFigure photoUrl={photoUrl} outfit={outfit} /></g>
    </svg>
  );
}
