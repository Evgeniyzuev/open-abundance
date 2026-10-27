"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useUserContext } from "@/components/UserProvider";
import { trackProductEvent } from "@/lib/productAnalytics";
import { formatRoundedMoney } from "@/lib/moneyFormat";
import { matchSmallWish, pickSmallWishOffers, smallWishText, type SmallWish } from "@/lib/smallWishes";

const DISMISS_DAYS = 7;
const DAY_MS = 86_400_000;

type OwnWish = { title: string; category: string | null; status: string };

function dismissKey(userId: string) {
  return `oa.smallWishOffer.dismissedUntil.${userId}`;
}

function readDismissed(userId: string): boolean {
  try {
    return Number(window.localStorage.getItem(dismissKey(userId)) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * One quiet card with three small wishes (help from people, a habit, a small sum). Shown only after the
 * person has a wish of their own, hidden while a small wish is active, and "Not now" hides it for a week.
 */
export default function SmallWishOffer({ coreBalance, onAdd, wishes }: { coreBalance: number; onAdd: (wish: SmallWish) => Promise<void> | void; wishes: OwnWish[] }) {
  const { locale, t, user } = useUserContext();
  const userId = user?.id ?? null;
  const [dismissed, setDismissed] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(userId ? readDismissed(userId) : true);
  }, [userId]);

  const ownedKeys = useMemo(() => wishes.map((wish) => matchSmallWish(wish.title)?.key).filter((key): key is string => Boolean(key)), [wishes]);
  const hasActiveSmall = wishes.some((wish) => wish.status === "active" && matchSmallWish(wish.title));
  const offers = useMemo(() => pickSmallWishOffers({
    coreBalance,
    categories: wishes.map((wish) => wish.category ?? "").filter(Boolean),
    ownedKeys,
    seed: `${userId ?? ""}:${new Date().toISOString().slice(0, 10)}`
  }), [coreBalance, ownedKeys, userId, wishes]);

  const visible = Boolean(userId) && !dismissed && !hasActiveSmall && wishes.length > 0 && offers.length > 0;

  useEffect(() => {
    if (visible) trackProductEvent("small_wish_offer_shown", { keys: offers.map((offer) => offer.key).join(",") });
  }, [visible, offers]);

  if (!visible || !userId) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(dismissKey(userId!), String(Date.now() + DISMISS_DAYS * DAY_MS));
    } catch {
      // Without storage the card simply stays hidden for this visit.
    }
    setDismissed(true);
    trackProductEvent("small_wish_offer_dismissed", {});
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
    <section className="small-wish-offer home-card" aria-label={t("wishes.small.title")}>
      <span className="home-card-label">{t("wishes.small.label")}</span>
      <h3>{t("wishes.small.title")}</h3>
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
      <button className="text-button small-wish-skip" type="button" onClick={dismiss}>{t("wishes.small.notNow")}</button>
    </section>
  );
}
