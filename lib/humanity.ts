import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Humanity confirmation through Didit. Keys stay on the server:
 *   DIDIT_API_KEY         x-api-key of the Didit application
 *   DIDIT_WORKFLOW_ID     workflow with liveness and face search (duplicate detection set to decline)
 *   DIDIT_WEBHOOK_SECRET  secret of the webhook destination
 * Nothing biometric is stored by this application, only the provider result.
 */

export const HUMANITY_CONSENT_VERSION = "2026-10-12.1";
export const HUMANITY_SCENARIO_VERSION = "didit-liveness-faceduplicate-v1";
export const HUMANITY_DAILY_ATTEMPTS = 5;

const DIDIT_BASE_URL = "https://verification.didit.me";
const WEBHOOK_TOLERANCE_SECONDS = 300;

export type DiditConfig = { apiKey: string; workflowId: string; webhookSecret: string | null };

export function loadDiditConfig(): DiditConfig | null {
  const apiKey = process.env.DIDIT_API_KEY?.trim();
  const workflowId = process.env.DIDIT_WORKFLOW_ID?.trim();
  if (!apiKey || !workflowId) return null;
  return { apiKey, workflowId, webhookSecret: process.env.DIDIT_WEBHOOK_SECRET?.trim() || null };
}

export async function createDiditSession(config: DiditConfig, input: { userId: string; callbackUrl: string; language: string }) {
  const response = await fetch(`${DIDIT_BASE_URL}/v3/session/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
    body: JSON.stringify({
      workflow_id: config.workflowId,
      vendor_data: input.userId,
      callback: input.callbackUrl,
      language: input.language
    }),
    signal: AbortSignal.timeout(12_000)
  });
  const payload = (await response.json().catch(() => ({}))) as { session_id?: string; url?: string };
  if (!response.ok || !payload.session_id || !payload.url) {
    throw new Error(`Didit session request failed (${response.status}).`);
  }
  return { sessionId: payload.session_id, url: payload.url };
}

/** Reads the decision directly from Didit so the webhook body alone never grants a level. */
export async function fetchDiditSessionStatus(config: DiditConfig, sessionId: string): Promise<{ status: string; userId: string | null } | null> {
  try {
    const response = await fetch(`${DIDIT_BASE_URL}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
      headers: { "x-api-key": config.apiKey },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { status?: string; vendor_data?: string | null };
    return typeof payload.status === "string" ? { status: payload.status, userId: payload.vendor_data ?? null } : null;
  } catch {
    return null;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Verifies X-Signature-V2: HMAC-SHA256 over the canonical JSON of the parsed body, plus freshness. */
export function verifyDiditWebhook(parsedBody: unknown, headers: Headers, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const timestamp = Number.parseInt(headers.get("x-timestamp") ?? "", 10);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const provided = headers.get("x-signature-v2") ?? "";
  if (!provided) return false;
  const expected = createHmac("sha256", secret).update(JSON.stringify(sortKeys(parsedBody)), "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
