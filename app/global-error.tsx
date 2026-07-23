"use client";

import AppErrorScreen from "@/components/AppErrorScreen";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <AppErrorScreen error={error} onRetry={reset} />
      </body>
    </html>
  );
}
