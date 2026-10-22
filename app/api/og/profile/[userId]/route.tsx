/* eslint-disable @next/next/no-img-element -- next/og renders plain <img>; next/image does not apply here. */
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { personName } from "@/lib/personName";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SITE_HOST = "open-abundance.vercel.app";

const fonts = Promise.all([
  fetch(new URL("../../../reality/card/fonts/inter-latin-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../../reality/card/fonts/inter-cyrillic-400-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../../reality/card/fonts/inter-latin-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer()),
  fetch(new URL("../../../reality/card/fonts/inter-cyrillic-800-normal.woff", import.meta.url)).then((response) => response.arrayBuffer())
]);

/**
 * The picture a link to a person's public page shows in a messenger (1200x630): the avatar, the name, the nickname
 * and the level. Only data the public profile already shows is used; no bio, no numbers.
 */
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const userId = /^[0-9a-f-]{36}$/i.test(params.userId) ? params.userId : null;
  if (!userId) return new Response("Not found", { status: 404 });

  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await supabase.from("user_profiles").select("display_name,username,avatar_url,level").eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const name = personName(profile, "Open Abundance");
  const [latin400, cyrillic400, latin800, cyrillic800] = await fonts;
  const avatar = profile.avatar_url && /^https:\/\//.test(profile.avatar_url) ? profile.avatar_url : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, fontFamily: "Inter, InterCyrillic", color: "#fff", background: "linear-gradient(150deg, #082d3f 0%, #2b2f8f 55%, #675dff 100%)" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 1, color: "#9cc9ff" }}>Open Abundance</div>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {avatar ? <img src={avatar} alt="" width={220} height={220} style={{ width: 220, height: 220, borderRadius: 110, objectFit: "cover", border: "6px solid rgba(255,255,255,0.95)" }} /> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: avatar ? 760 : 1000 }}>
            <div style={{ display: "flex", fontSize: name.length > 22 ? 62 : 84, fontWeight: 800, lineHeight: 1.05 }}>{name.slice(0, 48)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {profile.username ? <div style={{ display: "flex", fontSize: 38, fontWeight: 400, color: "#cfe3ff" }}>@{profile.username}</div> : null}
              <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#1b1300", background: "#ffbd4a", borderRadius: 999, padding: "6px 22px" }}>Lvl {profile.level ?? 0}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 400, color: "#cfe3ff" }}>{SITE_HOST}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: latin400, weight: 400, style: "normal" },
        { name: "InterCyrillic", data: cyrillic400, weight: 400, style: "normal" },
        { name: "Inter", data: latin800, weight: 800, style: "normal" },
        { name: "InterCyrillic", data: cyrillic800, weight: 800, style: "normal" }
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" }
    }
  );
}
