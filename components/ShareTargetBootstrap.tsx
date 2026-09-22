"use client";

import { useEffect } from "react";

export const SHARE_TARGET_DRAFT_STORAGE_KEY = "oa.shareTargetDraft.v1";

export type ShareTargetDraft = {
  title: string;
  text: string;
  url: string;
  candidates: string[];
  receivedAt: string;
};

export function captureShareTargetDraftFromLocation(): ShareTargetDraft | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const isShareTarget = params.has("share-target") || params.has("url") || params.has("text");
  if (!isShareTarget) return null;

  const title = (params.get("title") ?? "").trim().slice(0, 120);
  const text = (params.get("text") ?? "").trim().slice(0, 4000);
  const candidates = collectShareUrls(params.get("url") ?? "", text);
  const selectedUrl = candidates.length === 1 ? candidates[0] : "";
  const draft: ShareTargetDraft = {
    title,
    text: selectedUrl ? removeSelectedUrl(text, selectedUrl) : text,
    url: selectedUrl,
    candidates,
    receivedAt: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(SHARE_TARGET_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Keep the share payload in the URL if local storage is unavailable.
  }

  params.delete("share-target");
  params.delete("title");
  params.delete("text");
  params.delete("url");
  const nextSearch = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);

  return draft;
}

export function readShareTargetDraft(): ShareTargetDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHARE_TARGET_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShareTargetDraft>;
    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.filter((candidate): candidate is string => typeof candidate === "string" && isHttpUrl(candidate)).slice(0, 8)
      : [];
    return {
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 120) : "",
      text: typeof parsed.text === "string" ? parsed.text.slice(0, 4000) : "",
      url: typeof parsed.url === "string" && isHttpUrl(parsed.url) ? parsed.url : "",
      candidates,
      receivedAt: typeof parsed.receivedAt === "string" ? parsed.receivedAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}

export function saveShareTargetDraft(draft: ShareTargetDraft): boolean {
  try {
    window.localStorage.setItem(SHARE_TARGET_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function selectShareTargetDraft(draft: ShareTargetDraft, url: string): ShareTargetDraft | null {
  if (!draft.candidates.includes(url) || !isHttpUrl(url)) return null;
  return {
    ...draft,
    text: removeSelectedUrl(draft.text, url),
    url,
    candidates: [url]
  };
}

export default function ShareTargetBootstrap() {
  useEffect(() => {
    captureShareTargetDraftFromLocation();
  }, []);

  return null;
}

function collectShareUrls(explicitUrl: string, text: string): string[] {
  const matches = [explicitUrl, ...(text.match(/https?:\/\/[^\s<>"']+/gi) ?? [])]
    .map((value) => trimUrlPunctuation(value.trim()))
    .filter(isHttpUrl);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of matches) {
    const identity = new URL(candidate).href;
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(candidate);
    if (unique.length === 8) break;
  }
  return unique;
}

function removeSelectedUrl(text: string, url: string): string {
  return text.replace(url, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[),.;!?\]}]+$/g, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
