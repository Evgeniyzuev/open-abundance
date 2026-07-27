"use client";

import { useState } from "react";
import type { MessageKey } from "@/lib/i18n";

type MediaUrlHelpProps = {
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
};

/** Compact, reusable guidance for fields that accept publicly reachable media URLs. */
export default function MediaUrlHelp({ t }: MediaUrlHelpProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="media-url-help">
      <button
        className="media-url-help-trigger"
        type="button"
        aria-label={t("media.urlHelp.open")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open ? (
        <span className="media-url-help-popover" role="dialog" aria-label={t("media.urlHelp.title")}>
          <strong>{t("media.urlHelp.title")}</strong>
          <p>{t("media.urlHelp.intro")}</p>
          <ol>
            <li>{t("media.urlHelp.step1")}</li>
            <li>{t("media.urlHelp.step2")}</li>
            <li>{t("media.urlHelp.step3")}</li>
            <li>{t("media.urlHelp.step4")}</li>
          </ol>
          <button className="text-button" type="button" onClick={() => setOpen(false)}>
            {t("media.urlHelp.close")}
          </button>
        </span>
      ) : null}
    </span>
  );
}
