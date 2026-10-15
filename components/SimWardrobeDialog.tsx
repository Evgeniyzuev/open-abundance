"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import SacredItemIcon from "@/components/SacredItemIcon";
import SimScene from "@/components/SimScene";
import SimWalk from "@/components/SimWalk";
import { useUserContext } from "@/components/UserProvider";
import type { FutureDay } from "@/lib/futureDay";
import type { MessageKey } from "@/lib/i18n";
import { sceneToPng, shareOrDownload } from "@/lib/simPhoto";
import { SIM_CLOTHES, SIM_POSES, SIM_SHELF_MAX, SIM_SLOTS, type SimOutfit, type SimPose, type SimSlot } from "@/lib/simWardrobe";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

type OwnedItem = { id: string; title: string; metadata: { item_key?: string } | null };

/** Free wardrobe and scene of the sim: clothes, surroundings, pose, a shelf of owned items and photo mode. */
export default function SimWardrobeDialog({ outfit, shelf, pose, photoUrl, day, walk, onOutfit, onShelf, onPose, onClose }: {
  outfit: SimOutfit;
  shelf: string[];
  pose: SimPose;
  photoUrl?: string | null;
  day?: FutureDay;
  walk?: { ratio: number; label: string } | null;
  onOutfit: (outfit: SimOutfit) => void;
  onShelf: (shelf: string[]) => void;
  onPose: (pose: SimPose) => void;
  onClose: () => void;
}) {
  const { t } = useUserContext();
  const figureRef = useRef<HTMLDivElement>(null);
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithSupabaseAuth(`/api/shop/merge?ts=${Date.now()}`, { cache: "no-store" }, { authRequired: true });
        const payload = await response.json() as { items?: OwnedItem[] };
        if (!cancelled && response.ok) setOwned(payload.items ?? []);
      } catch {
        // The shelf simply offers nothing when items cannot be loaded.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // One chip per catalog item, even when the person owns several copies.
  const shelfOptions = [...new Map(owned.filter((item) => item.metadata?.item_key).map((item) => [item.metadata!.item_key as string, item])).values()];

  function toggle(slot: SimSlot, id: string) {
    const next = { ...outfit };
    if (next[slot] === id) delete next[slot];
    else next[slot] = id;
    onOutfit(next);
  }

  function toggleShelf(key: string) {
    onShelf(shelf.includes(key) ? shelf.filter((value) => value !== key) : [...shelf, key].slice(0, SIM_SHELF_MAX));
  }

  async function takePhoto() {
    const svg = figureRef.current?.querySelector("svg");
    if (!svg) return;
    setBusy(true);
    setError(null);
    try {
      const style = getComputedStyle(figureRef.current as HTMLElement);
      const blob = await sceneToPng(svg, { color: style.color, background: style.backgroundColor, caption: t("board.simulation") });
      if (blob) await shareOrDownload(blob, "my-future.png");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : String(photoError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet bare className="sim-wardrobe" ariaLabel={t("sim.title")} onClose={onClose}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <h2>{t("sim.title")}</h2>
        <div className="sim-wardrobe-figure" ref={figureRef}><SimScene photoUrl={photoUrl} outfit={outfit} day={day} pose={pose} shelf={shelf} /></div>
        {walk ? <SimWalk ratio={walk.ratio} label={walk.label} title={t("sim.walk")} /> : null}
        <div className="sim-wardrobe-row">
          <span>{t("sim.pose.title")}</span>
          <div role="group" aria-label={t("sim.pose.title")}>
            {SIM_POSES.map((value) => (
              <button className={pose === value ? "active" : ""} type="button" aria-pressed={pose === value} key={value} onClick={() => onPose(value)}>
                {t(`sim.pose.${value}` as MessageKey)}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => { void takePhoto(); }}>{busy ? t("app.common.loading") : t("sim.photo")}</button>
          </div>
        </div>
        {error ? <p className="finance-error">{error}</p> : null}
        {shelfOptions.length ? (
          <div className="sim-wardrobe-row">
            <span>{t("sim.shelf")}</span>
            <div role="group" aria-label={t("sim.shelf")}>
              {shelfOptions.map((item) => {
                const key = item.metadata?.item_key as string;
                return (
                  <button className={shelf.includes(key) ? "active" : ""} type="button" aria-pressed={shelf.includes(key)} key={key} onClick={() => toggleShelf(key)}>
                    <SacredItemIcon itemKey={key} size={18} />
                    {item.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {SIM_SLOTS.map((slot) => (
          <div className="sim-wardrobe-row" key={slot}>
            <span>{t(`sim.slot.${slot}` as MessageKey)}</span>
            <div role="group" aria-label={t(`sim.slot.${slot}` as MessageKey)}>
              {SIM_CLOTHES.filter((item) => item.slot === slot).map((item) => (
                <button className={outfit[slot] === item.id ? "active" : ""} type="button" aria-pressed={outfit[slot] === item.id} key={item.id} onClick={() => toggle(slot, item.id)}>
                  {t(`sim.item.${item.id}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
        ))}
    </Sheet>
  );
}
