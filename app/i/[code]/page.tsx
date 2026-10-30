import type { Metadata } from "next";
import InviteRedirect from "@/components/InviteRedirect";
import { createServiceSupabaseClient } from "@/lib/serverSupabase";

export const revalidate = 3600;

type Invite = { name: string | null; locale: "ru" | "en" };

const TEXT = {
  ru: {
    title: (name: string | null) => (name ? `${name} зовёт тебя в Open Abundance` : "Тебя зовут в Open Abundance"),
    description: "Простые действия и достойные награды. Узнай, сколько можно сделать уже сегодня. Построим ИИ-изобилие вместе!",
    open: "Открыть приглашение"
  },
  en: {
    title: (name: string | null) => (name ? `${name} invites you to Open Abundance` : "You are invited to Open Abundance"),
    description: "Simple actions, fair rewards. See how much you can do today. Let's build AI abundance together!",
    open: "Open the invitation"
  }
};

function cleanCode(raw: string): string | null {
  const code = decodeURIComponent(raw);
  return /^[A-Za-z0-9_-]{4,64}$/.test(code) ? code : null;
}

/** The inviter's name for the link preview (always in English, founder decision 2026-10-27); an unknown code still gets the generic invitation. */
async function loadInvite(code: string | null): Promise<Invite> {
  if (!code) return { name: null, locale: "en" };
  try {
    const db = createServiceSupabaseClient();
    const { data: row } = await db.from("referral_codes").select("user_id").eq("code", code).eq("is_active", true).maybeSingle();
    if (!row?.user_id) return { name: null, locale: "en" };
    const { data: profile } = await db.from("user_profiles").select("display_name,username").eq("user_id", row.user_id).maybeSingle();
    const name = profile?.display_name?.trim() || (profile?.username ? `@${profile.username}` : null);
    return { name: name ? name.slice(0, 60) : null, locale: "en" };
  } catch {
    return { name: null, locale: "en" };
  }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const invite = await loadInvite(cleanCode(params.code));
  const text = TEXT[invite.locale];
  const title = text.title(invite.name);
  const image = { url: `/og/invite-${invite.locale}.jpg?v=3`, width: 1200, height: 630, alt: text.description };
  return {
    title: { absolute: title },
    description: text.description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "Open Abundance", title, description: text.description, images: [image] },
    twitter: { card: "summary_large_image", title, description: text.description, images: [image.url] }
  };
}

/**
 * A short invitation link (/i/<code>) that looks good when shared: the preview names the inviter and shows the
 * invitation card. A person is sent on to the app with the same referral code (/?ref=<code>).
 */
export default async function InvitePage({ params, searchParams }: { params: { code: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const code = cleanCode(params.code);
  const invite = await loadInvite(code);
  const text = TEXT[invite.locale];
  const target = new URLSearchParams();
  if (code) target.set("ref", code);
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = searchParams[key];
    if (typeof value === "string" && value) target.set(key, value);
  }
  if (!target.has("utm_medium")) target.set("utm_medium", "invite");
  // «A task for two»: the app offers to join the friend's duo after sign-in.
  const duo = searchParams.duo;
  if (typeof duo === "string" && /^[a-z0-9]{6,16}$/.test(duo)) target.set("duo", duo);
  const href = `/?${target.toString()}`;

  return (
    <main className="legal-page" lang={invite.locale}>
      <article className="legal-document" style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={`/og/invite-${invite.locale}.jpg`} style={{ width: "100%", maxWidth: 600, borderRadius: 16 }} />
        <h1>{text.title(invite.name)}</h1>
        <p>{text.description}</p>
        <p><a className="legal-home-link" href={href}>{text.open}</a></p>
        <InviteRedirect href={href} />
      </article>
    </main>
  );
}
