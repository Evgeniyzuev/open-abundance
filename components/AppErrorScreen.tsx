"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, detectPreferredLocale, translate } from "@/lib/i18n";
import { trackProductEvent } from "@/lib/productAnalytics";

export default function AppErrorScreen({ error, onRetry }: { error: Error & { digest?: string }; onRetry: () => void }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    setLocale(detectPreferredLocale());
    trackProductEvent("app_render_failed", {
      digest: error.digest ?? null,
      name: error.name || "Error"
    });
    console.error(error);
  }, [error]);

  return (
    <main className="app-error-screen">
      <section className="app-error-card" role="alert">
        <span className="startup-brand" aria-hidden="true">OA</span>
        <h1>{translate(locale, "app.error.title")}</h1>
        <p>{translate(locale, "app.error.description")}</p>
        <button className="app-error-retry" type="button" onClick={onRetry}>{translate(locale, "startup.retry")}</button>
      </section>
    </main>
  );
}
