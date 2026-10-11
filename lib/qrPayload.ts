// Pure parser for what a QR code can hold in a payment flow (no imports, tested directly by node):
// a TON address or transfer link, an Open Abundance person link or nickname, or a payment-request link.

export type ScannedPayload =
  | { kind: "ton"; address: string; amountNano?: string; comment?: string }
  | { kind: "nick"; nickname: string }
  | { kind: "user"; userId: string }
  | { kind: "pay"; requestId: string }
  | { kind: "unknown" };

const TON_FRIENDLY = /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/;
const TON_RAW = /^-?[01]:[0-9a-fA-F]{64}$/;
const NICKNAME = /^[a-z][a-z0-9]{4,23}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTonAddress(value: string): boolean {
  return TON_FRIENDLY.test(value) || TON_RAW.test(value);
}

export function parseScanned(input: string): ScannedPayload {
  const text = input.trim();
  if (!text || text.length > 2048) return { kind: "unknown" };

  if (isTonAddress(text)) return { kind: "ton", address: text };

  const nick = text.replace(/^@/, "").toLowerCase();
  if (text.startsWith("@") && NICKNAME.test(nick)) return { kind: "nick", nickname: nick };

  // ton://transfer/<address>?amount=<nano>&text=<comment>
  const tonLink = text.match(/^ton:\/\/transfer\/([^?#]+)(?:\?([^#]*))?/i);
  if (tonLink) return tonFrom(safeDecode(tonLink[1]), tonLink[2] ?? "");

  let url: URL;
  try { url = new URL(text); } catch { return { kind: "unknown" }; }
  const path = url.pathname;

  // https://app.tonkeeper.com/transfer/<address>?amount=... and similar wallet links
  const transfer = path.match(/\/transfer\/([^/]+)\/?$/i);
  if (transfer && /^https?:$/.test(url.protocol)) {
    const parsed = tonFrom(safeDecode(transfer[1]), url.search.replace(/^\?/, ""));
    if (parsed.kind === "ton") return parsed;
  }

  const person = path.match(/^\/(?:pay\/)?@([A-Za-z0-9]+)\/?$/);
  if (person && NICKNAME.test(person[1].toLowerCase())) return { kind: "nick", nickname: person[1].toLowerCase() };

  const user = path.match(/^\/u\/([0-9a-fA-F-]{36})\/?$/);
  if (user && UUID.test(user[1])) return { kind: "user", userId: user[1].toLowerCase() };

  const requestId = url.searchParams.get("pay");
  if (requestId && UUID.test(requestId)) return { kind: "pay", requestId: requestId.toLowerCase() };

  return { kind: "unknown" };
}

function tonFrom(address: string, query: string): ScannedPayload {
  if (!isTonAddress(address)) return { kind: "unknown" };
  const params = new URLSearchParams(query);
  const amount = params.get("amount");
  const comment = params.get("text");
  return {
    kind: "ton",
    address,
    ...(amount && /^\d{1,20}$/.test(amount) ? { amountNano: amount } : {}),
    ...(comment ? { comment: comment.slice(0, 200) } : {})
  };
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
