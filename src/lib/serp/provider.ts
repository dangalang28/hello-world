import type { SerpProvider } from "@/lib/types";
import { manualSerpProvider } from "./manual";

/**
 * Returns the configured SERP provider. V1 ships only the manual stub;
 * to add a real provider, implement SerpProvider (e.g. serpapi.ts) and
 * register it here under its SERP_PROVIDER env value.
 */
export function getSerpProvider(): SerpProvider {
  switch (process.env.SERP_PROVIDER) {
    // case "serpapi": return serpApiProvider;
    // case "dataforseo": return dataForSeoProvider;
    default:
      return manualSerpProvider;
  }
}
