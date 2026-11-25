import { ImageResponse } from "next/og";
import { buildMomentCard } from "@/lib/momentShare";

export const runtime = "edge";

const SIZES = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
const ACCENT: Record<string, string> = { path: "#7ee2a8", quest: "#7ee2a8", chest: "#ffbd4a", week: "#9cc9ff", pledge: "#ff9f7a", mission: "#d7a6ff" };

const fonts = Promise.all([
  fetch(new URL("../../reality/card/fonts/inter-latin-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../reality/card/fonts/inter-cyrillic-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../reality/card/fonts/inter-latin-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../reality/card/fonts/inter-cyrillic-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer())
]);

// The image for a shared key moment (lib/momentShare.ts). Text comes from the link, so nothing here is presented as
// verified by the system.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "post" ? "post" : "story";
  const size = SIZES[format];
  const card = buildMomentCard({ kind: url.searchParams.get("kind"), title: url.searchParams.get("title"), line: url.searchParams.get("line"), locale: url.searchParams.get("locale") });
  const accent = ACCENT[card.kind] ?? "#7ee2a8";
  const [latin400, cyrillic400, latin800, cyrillic800] = await fonts;
  const pad = 84;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: `${format === "story" ? 170 : pad}px ${pad}px ${format === "story" ? 190 : pad}px`, fontFamily: "Inter, InterCyrillic", color: "#fff", background: "linear-gradient(160deg, #082d3f 0%, #2b2f8f 55%, #675dff 100%)" }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 800, opacity: 0.92 }}>Open Abundance</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 36, fontWeight: 800, color: "#082d3f", background: accent, borderRadius: 999, padding: "12px 30px" }}>{card.eyebrow}</div>
          <div style={{ display: "flex", fontSize: card.title.length > 40 ? 76 : 96, fontWeight: 800, lineHeight: 1.06 }}>{card.title}</div>
          {card.line ? <div style={{ display: "flex", fontSize: 44, lineHeight: 1.3, opacity: 0.9 }}>{card.line}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 800 }}>{card.footer}</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.8 }}>open-abundance.vercel.app</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: latin400, weight: 400, style: "normal" },
        { name: "InterCyrillic", data: cyrillic400, weight: 400, style: "normal" },
        { name: "Inter", data: latin800, weight: 800, style: "normal" },
        { name: "InterCyrillic", data: cyrillic800, weight: 800, style: "normal" }
      ],
      headers: { "Cache-Control": "public, max-age=86400" }
    }
  );
}
