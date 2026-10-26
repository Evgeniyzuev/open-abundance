"use client";

import { ExternalLink, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import WatchWithNova from "@/components/WatchWithNova";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { findShortVideoLinks, findVideoEmbeds, VIDEO_PROVIDER_LABELS, type VideoEmbed as Embed } from "@/lib/videoEmbed";

type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

/** If the player has not reported loading by then, the plain link is offered prominently. */
const SLOW_LOAD_MS = 12_000;

/**
 * One official embedded player behind a tap. Nothing loads from the platform until the
 * person taps, which keeps the feed light on phones and in the Telegram Mini App; the
 * "open in the app" link is always there for blocked regions, private posts and old webviews.
 */
export function VideoEmbedPlayer({ embed, title, author, thumbnailUrl, locale, t }: {
  embed: Embed;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
  locale: AppLocale;
  t: Translate;
}) {
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [companion, setCompanion] = useState(false);
  const timer = useRef<number | null>(null);
  const provider = VIDEO_PROVIDER_LABELS[embed.provider];
  const still = thumbnailUrl || embed.thumbnailUrl;

  useEffect(() => {
    if (!active || loaded) return;
    timer.current = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [active, loaded]);

  function start(withNova: boolean) {
    setActive(true);
    if (withNova) setCompanion(true);
  }

  function stop() {
    setActive(false);
    setLoaded(false);
    setSlow(false);
    setCompanion(false);
  }

  return (
    <div className={`video-embed video-embed-${embed.shape} video-embed-from-${embed.provider}${active ? " active" : ""}`} onClick={(event) => event.stopPropagation()}>
      <div className="video-embed-frame">
        {active ? (
          <iframe
            src={embed.embedUrl}
            title={title || t("video.embed.playerTitle", { provider })}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <button className="video-embed-facade" type="button" onClick={() => start(false)} aria-label={t("video.embed.play", { provider })}>
            {still ? <img src={still} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            <span className="video-embed-play"><Play size={26} fill="currentColor" aria-hidden="true" /></span>
            <span className="video-embed-caption">
              <small>{provider}</small>
              {title ? <strong>{title}</strong> : null}
            </span>
          </button>
        )}
      </div>
      {slow && !loaded ? <p className="video-embed-slow">{t("video.embed.slow", { provider })}</p> : null}
      <div className="video-embed-actions">
        <a href={embed.sourceUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          {t("video.embed.open", { provider })}
        </a>
        {!companion ? (
          <button type="button" onClick={() => start(true)}>
            <Sparkles size={14} aria-hidden="true" />
            {t("video.nova.start")}
          </button>
        ) : null}
      </div>
      {companion ? (
        <WatchWithNova
          provider={embed.provider}
          title={title ?? null}
          author={author ?? null}
          locale={locale}
          t={t}
          onClose={() => setCompanion(false)}
          onEnough={stop}
        />
      ) : null}
    </div>
  );
}

const resolvedShortLinks = new Map<string, Embed | null>();

/**
 * A short share link (TikTok's vt.tiktok.com/…) becomes a player once the server has
 * followed its redirect; until then, and if that fails, the fallback (usually the link card) shows.
 */
export function ShortLinkVideoEmbed({ url, fallback = null, ...rest }: {
  url: string;
  fallback?: ReactNode;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
  locale: AppLocale;
  t: Translate;
}) {
  const [embed, setEmbed] = useState<Embed | null>(() => resolvedShortLinks.get(url) ?? null);

  useEffect(() => {
    if (resolvedShortLinks.has(url)) {
      setEmbed(resolvedShortLinks.get(url) ?? null);
      return;
    }
    let cancelled = false;
    fetch(`/api/video/resolve?url=${encodeURIComponent(url)}`)
      .then((response) => response.ok ? response.json() as Promise<{ embed?: Embed | null }> : { embed: null })
      .then((payload) => {
        const value = payload.embed?.embedUrl ? payload.embed : null;
        resolvedShortLinks.set(url, value);
        if (!cancelled) setEmbed(value);
      })
      .catch(() => { /* the link stays a link */ });
    return () => { cancelled = true; };
  }, [url]);

  return embed ? <VideoEmbedPlayer embed={embed} {...rest} /> : <>{fallback}</>;
}

/** Players for the video links inside free text, such as a note or a post body. */
export function TextVideoEmbeds({ text, locale, t }: { text: string | null | undefined; locale: AppLocale; t: Translate }) {
  const embeds = findVideoEmbeds(text);
  const shortLinks = findShortVideoLinks(text, Math.max(0, 2 - embeds.length));
  if (!embeds.length && !shortLinks.length) return null;
  return (
    <div className="video-embed-list">
      {embeds.map((embed) => <VideoEmbedPlayer key={embed.embedUrl} embed={embed} locale={locale} t={t} />)}
      {shortLinks.map((link) => <ShortLinkVideoEmbed key={link} url={link} locale={locale} t={t} />)}
    </div>
  );
}
