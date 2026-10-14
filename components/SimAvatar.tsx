import { SIM_CLOTHES, type SimOutfit } from "@/lib/simWardrobe";

/**
 * The stylised "future me" figure: a line-art mannequin in the style of the item icons. The profile photo,
 * when there is one, sits in the head; clothes are translucent line-art layers on top of the body.
 */
export default function SimAvatar({ photoUrl, outfit }: { photoUrl?: string | null; outfit: SimOutfit }) {
  const worn = Object.values(outfit).map((id) => SIM_CLOTHES.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><clipPath id="sim-head"><circle cx="50" cy="24" r="14" /></clipPath></defs>
      <path d="M34 46 H66 L64 92 H36 Z" />
      <path d="M34 48 L24 84 M66 48 L76 84 M42 92 L40 138 M58 92 L60 138" />
      <path d="M46 38 V46 M54 38 V46" />
      {photoUrl ? <image href={photoUrl} x="36" y="10" width="28" height="28" preserveAspectRatio="xMidYMid slice" clipPath="url(#sim-head)" /> : null}
      <circle cx="50" cy="24" r="14" />
      {worn.map((item) => item.paths.map((d, index) => <path key={`${item.id}${index}`} d={d} fill="currentColor" fillOpacity="0.18" />))}
    </svg>
  );
}
