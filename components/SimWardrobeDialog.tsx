"use client";

import { X } from "lucide-react";
import SimAvatar from "@/components/SimAvatar";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import { SIM_CLOTHES, SIM_SLOTS, type SimOutfit, type SimSlot } from "@/lib/simWardrobe";

/** Free wardrobe: pick at most one simple item per slot; the figure updates at once. */
export default function SimWardrobeDialog({ outfit, photoUrl, onChange, onClose }: {
  outfit: SimOutfit;
  photoUrl?: string | null;
  onChange: (outfit: SimOutfit) => void;
  onClose: () => void;
}) {
  const { t } = useUserContext();

  function toggle(slot: SimSlot, id: string) {
    const next = { ...outfit };
    if (next[slot] === id) delete next[slot];
    else next[slot] = id;
    onChange(next);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet sim-wardrobe" role="dialog" aria-modal="true" aria-label={t("sim.title")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <h2>{t("sim.title")}</h2>
        <div className="sim-wardrobe-figure"><SimAvatar photoUrl={photoUrl} outfit={outfit} /></div>
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
      </section>
    </div>
  );
}
