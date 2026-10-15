"use client";

import { useCallback, useRef, useState } from "react";
import { readFeedSnapshot, writeFeedSnapshot } from "@/lib/feedSnapshot";
import type { AppLocale } from "@/lib/i18n";
import type { FeedCategory, FeedPayload } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

export type FeedFilter = FeedCategory;

type FeedCacheEntry = { payload: FeedPayload; fetchedAt: number; locale: AppLocale };
type FeedCache = Record<FeedFilter, FeedCacheEntry | null>;

const FEED_CACHE_TTL_MS = 60_000;
const DEFAULT_FILTER: FeedFilter = "stories";

function perFilter<T>(value: T): Record<FeedFilter, T> {
  return { all: value, following: value, stories: value, opportunities: value, system: value, reviews: value };
}

async function getAccessToken(): Promise<string> {
  const { data: { session }, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

/**
 * Feed data layer: per-filter memory cache with a short TTL, a local snapshot for instant first paint,
 * cursor pagination, and guards against stale or duplicate in-flight requests.
 */
export function useFeed({ locale, userId }: { locale: AppLocale; userId: string | null }) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [filter, setFilter] = useState<FeedFilter>(DEFAULT_FILTER);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const filterRef = useRef<FeedFilter>(DEFAULT_FILTER);
  const cacheRef = useRef<FeedCache>(perFilter<FeedCacheEntry | null>(null));
  const cursorRef = useRef<Record<FeedFilter, string | null>>(perFilter<string | null>(null));
  const requestIdsRef = useRef<Record<FeedFilter, number>>(perFilter(0));
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const generationRef = useRef(0);
  filterRef.current = filter;

  const load = useCallback(async (append = false, force = false) => {
    if (!userId) return;

    const requestedFilter = filter;
    const cachedEntry = cacheRef.current[requestedFilter];
    const hasUsableCache = cachedEntry?.locale === locale;
    const cacheIsFresh = Boolean(cachedEntry && hasUsableCache && Date.now() - cachedEntry.fetchedAt < FEED_CACHE_TTL_MS);

    if (!append) {
      if (hasUsableCache && cachedEntry && filterRef.current === requestedFilter) setPayload(cachedEntry.payload);
      if (!force && cacheIsFresh) {
        if (filterRef.current === requestedFilter) setLoading(false);
        return;
      }
      if (!hasUsableCache && filterRef.current === requestedFilter) {
        const snapshot = readFeedSnapshot(userId, locale, requestedFilter);
        if (snapshot) setPayload((current) => current ?? snapshot);
      }
    }

    const requestKey = `${userId}:${locale}:${requestedFilter}:${append ? "append" : "replace"}`;
    const currentRequest = inFlightRef.current.get(requestKey);
    if (currentRequest) return currentRequest;

    const request = (async () => {
      const generation = generationRef.current;
      const requestId = requestIdsRef.current[requestedFilter] + 1;
      requestIdsRef.current[requestedFilter] = requestId;
      const isCurrent = () => generationRef.current === generation && requestIdsRef.current[requestedFilter] === requestId;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setFailed(false);
      }
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ scope: "feed", locale, limit: "21", ts: String(Date.now()) });
        if (requestedFilter !== "all") params.set("category", requestedFilter);
        const cursor = cursorRef.current[requestedFilter];
        if (append && cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/social/feed?${params.toString()}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
        });
        const next = (await response.json()) as FeedPayload;
        if (!response.ok || next.error) throw new Error(next.error ?? "Failed to load feed.");
        if (!isCurrent()) return;

        const currentEntry = cacheRef.current[requestedFilter];
        const currentPayload = currentEntry?.locale === locale ? currentEntry.payload : null;
        const nextPayload = append && currentPayload ? { ...next, posts: [...currentPayload.posts, ...next.posts] } : next;
        cursorRef.current[requestedFilter] = next.nextCursor ?? null;
        cacheRef.current[requestedFilter] = { payload: nextPayload, fetchedAt: Date.now(), locale };
        if (filterRef.current === requestedFilter) setPayload(nextPayload);
        if (!append) writeFeedSnapshot(userId, locale, requestedFilter, nextPayload);
      } catch (loadError) {
        if (!append && generationRef.current === generation && filterRef.current === requestedFilter) setFailed(true);
        throw loadError;
      } finally {
        if (isCurrent()) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    })();

    inFlightRef.current.set(requestKey, request);
    try {
      await request;
    } finally {
      if (inFlightRef.current.get(requestKey) === request) inFlightRef.current.delete(requestKey);
    }
  }, [filter, locale, userId]);

  const changeFilter = useCallback((next: FeedFilter) => {
    if (next === filterRef.current) return;
    filterRef.current = next;
    const cachedEntry = cacheRef.current[next];
    setPayload(cachedEntry?.locale === locale ? cachedEntry.payload : null);
    setFilter(next);
  }, [locale]);

  /** Marks cached pages stale so the next load refetches them. */
  const invalidate = useCallback(() => {
    const nextCache = { ...cacheRef.current };
    (Object.keys(nextCache) as FeedFilter[]).forEach((key) => {
      const entry = nextCache[key];
      if (entry) nextCache[key] = { ...entry, fetchedAt: 0 };
    });
    cacheRef.current = nextCache;
  }, []);

  /** Applies an in-place update to every cached page and re-shows the current one. */
  const updateCached = useCallback((update: (payload: FeedPayload) => FeedPayload) => {
    const nextCache = { ...cacheRef.current };
    (Object.keys(nextCache) as FeedFilter[]).forEach((key) => {
      const entry = nextCache[key];
      if (entry) nextCache[key] = { ...entry, payload: update(entry.payload) };
    });
    cacheRef.current = nextCache;
    const currentEntry = nextCache[filterRef.current];
    setPayload(currentEntry?.locale === locale ? currentEntry.payload : null);
  }, [locale]);

  /** Drops all state and cancels in-flight results (account switch). */
  const reset = useCallback(() => {
    setPayload(null);
    setFilter(DEFAULT_FILTER);
    setLoading(false);
    setLoadingMore(false);
    setFailed(false);
    cacheRef.current = perFilter<FeedCacheEntry | null>(null);
    cursorRef.current = perFilter<string | null>(null);
    requestIdsRef.current = perFilter(0);
    inFlightRef.current.clear();
    generationRef.current += 1;
  }, []);

  return { changeFilter, failed, filter, invalidate, load, loading, loadingMore, payload, reset, updateCached };
}
