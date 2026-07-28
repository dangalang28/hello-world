import type { ScanInput, ScanResult } from "@/lib/types";

const INPUT_KEY = "gbps:pending-input";
const LATEST_KEY = "gbps:latest-scan";

export function savePendingInput(input: ScanInput) {
  sessionStorage.setItem(INPUT_KEY, JSON.stringify(input));
}

export function loadPendingInput(): ScanInput | null {
  try {
    const raw = sessionStorage.getItem(INPUT_KEY);
    return raw ? (JSON.parse(raw) as ScanInput) : null;
  } catch {
    return null;
  }
}

export function saveScanResult(result: ScanResult) {
  const json = JSON.stringify(result);
  try {
    localStorage.setItem(LATEST_KEY, json);
    const slug = result.input.brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    localStorage.setItem(`gbps:scan:${slug}:${result.ranAt}`, json);
  } catch {
    // storage quota — latest-only fallback
    try {
      localStorage.setItem(LATEST_KEY, json);
    } catch { /* give up silently; download still works */ }
  }
}

export function loadLatestScan(): ScanResult | null {
  try {
    const raw = localStorage.getItem(LATEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanResult;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function listSavedScans(): { key: string; brand: string; ranAt: string }[] {
  const out: { key: string; brand: string; ranAt: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("gbps:scan:")) continue;
    const [, , slug, ranAt] = key.split(":");
    out.push({ key, brand: slug?.replace(/-/g, " ") ?? "?", ranAt: ranAt ?? "" });
  }
  return out.sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}

export function loadScanByKey(key: string): ScanResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanResult;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}
