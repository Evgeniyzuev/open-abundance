import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeClaudeOrOperator } from "@/lib/claudeActionsAuth";
import { sniffImageType } from "@/lib/externalImageCopy";
import { NO_STORE_HEADERS } from "@/lib/httpCache";
import { publicMediaUrl, putObject, readR2Config } from "@/lib/r2Media";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_BYTES = 3 * 1024 * 1024;
const PREFIX = /^[a-z0-9-]{1,40}$/;

/**
 * POST /api/internal/media/upload { base64, prefix? } — puts one picture (jpeg, png or webp, up to 3 MB) into the R2
 * bucket under editorial/<prefix>/<uuid>.<ext> and returns its public url. Used for story covers and avatars of the
 * AI mentors and characters, so a story with a new picture goes out without a redeploy. Callers: operator or Claude
 * (CLAUDE_ACTIONS_TOKEN), only for pictures the operator gave.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeClaudeOrOperator(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const config = readR2Config(process.env);
  if (!config) return json({ error: "R2 is not configured." }, 503);
  const payload = await request.json().catch(() => null) as { base64?: unknown; prefix?: unknown } | null;
  const prefix = typeof payload?.prefix === "string" && PREFIX.test(payload.prefix) ? payload.prefix : "misc";
  const base64 = typeof payload?.base64 === "string" ? payload.base64.replace(/^data:[^,]+,/, "") : "";
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: "base64 must hold a picture up to 3 MB." }, 400);
  const type = sniffImageType(bytes);
  if (!type) return json({ error: "Only jpeg, png and webp pictures." }, 400);
  const key = `editorial/${prefix}/${randomUUID()}.${type.extension}`;
  if (!(await putObject(config, key, bytes, type.contentType))) return json({ error: "Upload failed." }, 502);
  return json({ ok: true, url: publicMediaUrl(config, key) }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
