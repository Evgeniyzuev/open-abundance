"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageKey } from "@/lib/i18n";

type MediaUrlHelpProps = {
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

/** Free image hosts that work without an account and give a direct link. */
const NO_SIGNUP_HOSTS = [
  { name: "postimages.org", url: "https://postimages.org/" },
  { name: "imgbb.com", url: "https://imgbb.com/" },
  { name: "catbox.moe", url: "https://catbox.moe/" }
];

/**
 * Compact, reusable guidance for fields that accept publicly reachable media URLs.
 * The card is rendered into document.body and pinned to the bottom of the screen, so it never runs past
 * the screen edge, whatever field the "?" sits next to.
 */
export default function MediaUrlHelp({ t }: MediaUrlHelpProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="media-url-help">
      <button
        className="media-url-help-trigger"
        type="button"
        aria-label={t("media.urlHelp.open")}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        ?
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="media-url-help-layer"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="media-url-help-popover" role="dialog" aria-modal="true" aria-label={t("media.urlHelp.title")}>
            <strong>{t("media.urlHelp.title")}</strong>
            <p>{t("media.urlHelp.intro")}</p>
            <ol>
              <li>
                {t("media.urlHelp.step1")}
                <span className="media-url-help-hosts">
                  {NO_SIGNUP_HOSTS.map((host) => (
                    <a key={host.url} href={host.url} target="_blank" rel="noopener noreferrer">{host.name}</a>
                  ))}
                </span>
              </li>
              <li>{t("media.urlHelp.step2")}</li>
              <li>{t("media.urlHelp.step3")}</li>
            </ol>
            <p>{t("media.urlHelp.step4")}</p>
            <p>{t("media.urlHelp.heic")}</p>
            <button className="text-button" type="button" onClick={() => setOpen(false)}>
              {t("media.urlHelp.close")}
            </button>
          </div>
        </div>,
        document.body
      ) : null}
    </span>
  );
}
