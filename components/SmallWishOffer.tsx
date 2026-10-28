"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { trackProductEvent } from "@/lib/productAnalytics";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { matchSmallWish, pickSmallWishOffers, smallWishText, type SmallWish } from "@/lib/smallWishes";

type OwnWish = { title: string; category: string | null; status: string };

/**
 * A collapsed row "Start with a small wish" at the bottom of Recommended, always there (Evgen, 2026-10-28). Opening it
 * shows three small wishes (help from people, a habit, a small sum) to take with one tap.
 */
export default function SmallWishOffer({ coreBalance, onAdd, wishes }: { coreBalance: number; onAdd: (wish: SmallWish) => Promise<void> | void; wishes: OwnWish[] }) {
  const { locale, t, user } = useUserContext();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const ownedKeys = useMemo(() => wishes.map((wish) => matchSmallWish(wish.title)?.key).filter((key): key is string => Boolean(key)), [wishes]);
  const offers = useMemo(() => pickSmallWishOffers({
    coreBalance,
    categories: wishes.map((wish) => wish.category ?? "").filter(Boolean),
    ownedKeys,
    seed: `${userId ?? ""}:${new Date().toISOString().slice(0, 10)}`
  }), [coreBalance, ownedKeys, userId, wishes]);

  if (!userId || !offers.length) return null;

  function toggle() {
    setOpen((current) => {
      if (!current) trackProductEvent("small_wish_offer_shown", { keys: offers.map((offer) => offer.key).join(",") });
      return !current;
    });
  }

  async function add(wish: SmallWish) {
    setAdding(wish.key);
    try {
      await onAdd(wish);
      trackProductEvent("small_wish_added", { key: wish.key, kind: wish.kind, price: wish.price });
    } finally {
      setAdding(null);
    }
  }

  const kindLabel = (wish: SmallWish) => wish.kind === "money"
    ? formatRoundedMoney(wish.price, locale)
    : t(wish.kind === "help" ? "wishes.small.kind.help" : "wishes.small.kind.habit", { days: wish.days ?? 0 });

  return (
    <section className={`small-wish-offer${open ? " open" : ""}`} aria-label={t("wishes.small.title")}>
      <button className="values-feed-card compact" type="button" aria-expanded={open} onClick={toggle}>
        <span className="values-feed-emoji" aria-hidden="true">🌱</span>
        <span className="values-feed-copy"><strong>{t("wishes.dock.small")}</strong></span>
        <span className="values-feed-open">{open ? t("wishes.small.hide") : t("values.feed.open")}</span>
      </button>
      {open ? (
        <div className="small-wish-body">
          <p>{t("wishes.small.description")}</p>
          <div className="small-wish-options">
            {offers.map((wish) => (
              <article className="small-wish-option" key={wish.key}>
                <span className="small-wish-emoji" aria-hidden="true">{wish.emoji}</span>
                <div>
                  <strong>{smallWishText(wish.title, locale)}</strong>
                  <small>{kindLabel(wish)}</small>
                </div>
                <button className="secondary-button" type="button" disabled={adding !== null} onClick={() => void add(wish)}>
                  <Plus size={16} />
                  {t("wishes.small.take")}
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
