// Phone/address extraction + normalization for NAP consistency checks.

const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;

// Street address heuristic: number + words + street-type token.
const ADDRESS_RE =
  /\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Way|Ct|Court|Pl(?:ace)?|Pkwy|Parkway|Hwy|Highway|Suite|Ste)\.?\b[^\n<]{0,60}/gi;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // strip US country code for comparison
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function extractPhones(text: string): string[] {
  return [...new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim()))];
}

export function extractAddresses(text: string): string[] {
  return [...new Set((text.match(ADDRESS_RE) ?? []).map((a) => a.replace(/\s+/g, " ").trim()))];
}

const ADDRESS_ABBREV: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr",
  lane: "ln", court: "ct", place: "pl", parkway: "pkwy", highway: "hwy",
  suite: "ste", north: "n", south: "s", east: "e", west: "w",
};

export function addressTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ADDRESS_ABBREV[t] ?? t);
}

/** Loose address match: same street number and >=60% shared tokens. */
export function addressesMatch(a: string, b: string): boolean {
  const ta = addressTokens(a);
  const tb = addressTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta[0] !== tb[0]) return false; // street number must match
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  return shared / Math.min(ta.length, tb.length) >= 0.6;
}

/** Loose brand-name match ignoring punctuation, case, and legal suffixes. */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(llc|inc|co|corp|ltd|company)\b\.?/g, "")
      .replace(/[^a-z0-9]/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
