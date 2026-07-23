"use client";

import AppErrorScreen from "@/components/AppErrorScreen";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorScreen error={error} onRetry={reset} />;
}
