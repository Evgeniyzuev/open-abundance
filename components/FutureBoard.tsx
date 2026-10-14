"use client";

import { useEffect, useState } from "react";
import SimAvatar from "@/components/SimAvatar";
import SimWardrobeDialog from "@/components/SimWardrobeDialog";
import { useUserContext } from "@/components/UserProvider";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { readSimOutfit, storeSimOutfit, type SimOutfit } from "@/lib/simWardrobe";
import { readPrimaryWish } from "@/lib/wishJourney";

type Tile = { key: string; title: string; imageUrl: string | null; price: number | null; currency: string };

type WishRow = { id: string; title: string; image_url: string | null; target_amount: number | string | null; target_currency: string };
type ProductRow = { id: string; title: string; image_url: string | null; price_amount: number | string | null; price_currency: string; status: string };

// Cells around the centre of a 3x3 board, in priority order (the centre belongs to the person).
const CELLS: Array<[number, number]> = [[1, 1], [1, 3], [3, 1], [3, 3], [1, 2], [2, 1], [2, 3], [3, 2]];

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetchWithSupabaseAuth(path, { cache: "no-store" }, { authRequired: true });
    return response.ok ? (await response.json() as T) : null;
  } catch {
    return null;
  }
}

/**
 * Stage 0 of the Future Sim: a board with the person in the centre and the nearest wish, other active wishes
 * and products they are considering around. Nothing is generated; every tile comes from the person's own data.
 */
export default function FutureBoard() {
  const { locale, t, user, profile } = useUserContext();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [outfit, setOutfit] = useState<SimOutfit>({});
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => { setOutfit(readSimOutfit(userId)); }, [userId]);

  function changeOutfit(next: SimOutfit) {
    setOutfit(next);
    if (userId) storeSimOutfit(userId, next);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const [wishes, products] = await Promise.all([
        getJson<{ wishes?: WishRow[] }>(`/api/wishes?status=active&includeRecommended=false&ts=${Date.now()}`),
        getJson<{ products?: ProductRow[] }>(`/api/wishes/products?ts=${Date.now()}`)
      ]);
      if (cancelled) return;
      const primaryId = readPrimaryWish(userId)?.id ?? null;
      const wishTiles = (wishes?.wishes ?? [])
        .sort((a, b) => Number(b.id === primaryId) - Number(a.id === primaryId))
        .map((wish): Tile => ({ key: `w${wish.id}`, title: wish.title, imageUrl: wish.image_url, price: wish.target_amount === null ? null : Number(wish.target_amount), currency: wish.target_currency }));
      const productTiles = (products?.products ?? [])
        .filter((product) => product.status === "considering")
        .map((product): Tile => ({ key: `p${product.id}`, title: product.title, imageUrl: product.image_url, price: product.price_amount === null ? null : Number(product.price_amount), currency: product.price_currency }));
      setTiles([...wishTiles.slice(0, 5), ...productTiles].slice(0, CELLS.length));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId || tiles.length === 0) return null;

  return (
    <section className="future-board" aria-label={t("board.title")}>
      <div className="future-board-head">
        <strong>{t("board.title")}</strong>
        <small>{t("board.simulation")}</small>
      </div>
      <div className="future-board-grid">
        <button className="future-board-center" type="button" style={{ gridArea: "2 / 2" }} aria-label={t("sim.title")} onClick={() => setWardrobeOpen(true)}>
          <SimAvatar photoUrl={profile?.avatar_url} outfit={outfit} />
        </button>
        {tiles.map((tile, index) => (
          <div className="future-board-tile" key={tile.key} style={{ gridArea: `${CELLS[index][0]} / ${CELLS[index][1]}` }}>
            {tile.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tile.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : <span aria-hidden="true">{tile.title.slice(0, 1)}</span>}
            <strong>{tile.title}</strong>
            {tile.price !== null ? <small>{tile.currency === "USD" ? formatAdaptiveMoney(tile.price, locale) : `${tile.price} ${tile.currency}`}</small> : null}
          </div>
        ))}
      </div>
      {wardrobeOpen ? <SimWardrobeDialog outfit={outfit} photoUrl={profile?.avatar_url} onChange={changeOutfit} onClose={() => setWardrobeOpen(false)} /> : null}
    </section>
  );
}
