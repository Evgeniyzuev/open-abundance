export type AcquisitionSubmissionType = "publication" | "metric";
export type AcquisitionMetricKey = "views" | "reactions" | "comments";

export const ACQUISITION_REVIEW_DUE_HOURS = 24;

export const ACQUISITION_PLATFORM_RULES = [
  { key: "vc", label: "VC.ru", hosts: ["vc.ru", "www.vc.ru"] },
  { key: "habr", label: "Habr", hosts: ["habr.com", "www.habr.com"] },
  { key: "pikabu", label: "Пикабу", hosts: ["pikabu.ru", "www.pikabu.ru"] },
  { key: "reddit", label: "Reddit", hosts: ["reddit.com", "www.reddit.com", "old.reddit.com"] },
  { key: "productradar", label: "Product Radar", hosts: ["productradar.ru", "www.productradar.ru"] },
  { key: "telegra", label: "Telegraph", hosts: ["telegra.ph"] },
  { key: "telegram", label: "Публичный Telegram", hosts: ["t.me", "telegram.me"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "youtu.be"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com", "www.tiktok.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com", "www.instagram.com"] },
  { key: "blog", label: "Личный публичный блог", hosts: [] }
] as const;

const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isAcquisitionChallengeLogic(logic: string | null | undefined): boolean {
  return logic === "acquisition_publications_milestone" || logic?.startsWith("acquisition_metric_") === true;
}

export function isAcquisitionMetricLogic(logic: string | null | undefined): boolean {
  return logic === "acquisition_metric_views" || logic === "acquisition_metric_reactions" || logic === "acquisition_metric_comments";
}

export function metricKeyFromLogic(logic: string | null | undefined): AcquisitionMetricKey | null {
  if (!logic || !isAcquisitionMetricLogic(logic)) return null;
  return logic.slice("acquisition_metric_".length) as AcquisitionMetricKey;
}

export function normalizeAcquisitionUrl(raw: string): { url: string; host: string } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: "Publication URL is required." };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "Use a full public http(s) URL." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return { error: "Only public http(s) URLs are accepted." };
  if (parsed.username || parsed.password) return { error: "URLs with credentials are not accepted." };
  const host = parsed.hostname.toLowerCase();
  if (blockedHosts.has(host) || isPrivateIpv4(host)) return { error: "Local or private URLs are not accepted." };

  parsed.hash = "";
  return { url: parsed.toString(), host };
}

export function platformForHost(host: string): string {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  const match = ACQUISITION_PLATFORM_RULES.find((rule) => rule.hosts.some((ruleHost) => ruleHost.replace(/^www\./, "") === normalized));
  return match?.key ?? "blog";
}

export function platformLabel(platform: string): string {
  return ACQUISITION_PLATFORM_RULES.find((rule) => rule.key === platform)?.label ?? platform;
}

export function isAllowedAcquisitionPlatform(host: string, requestedPlatform?: string): boolean {
  const detected = platformForHost(host);
  if (!requestedPlatform) return true;
  if (requestedPlatform === "blog") return detected === "blog";
  return detected === requestedPlatform;
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}