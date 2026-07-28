// Shared-password operator gate. When OPERATOR_PASSWORD is unset the gate is
// disabled (local dev). The cookie stores an HMAC of a fixed payload keyed by
// the password, so changing the password invalidates existing sessions.

export const AUTH_COOKIE = "gbps_op";
const PAYLOAD = "operator-v1";

export async function expectedToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(PAYLOAD));
  return Buffer.from(sig).toString("base64url");
}

/** Edge-safe variant (middleware has no Buffer). */
export async function expectedTokenEdge(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(PAYLOAD));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
