"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";

export default function ProtectedImage({ src, alt, className, style, loading = "lazy" }: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "eager" | "lazy";
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    void fetchWithSupabaseAuth(src, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return;
      nextObjectUrl = URL.createObjectURL(blob);
      if (active) setObjectUrl(nextObjectUrl);
      else URL.revokeObjectURL(nextObjectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);
  return objectUrl ? <img alt={alt} className={className} loading={loading} src={objectUrl} style={style} /> : null;
}
