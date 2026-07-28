import type { SerpProvider } from "@/lib/types";

/** Stub provider: no SERP API configured. The serp check renders a manual checklist instead. */
export const manualSerpProvider: SerpProvider = {
  name: "manual",
  async search() {
    return { available: false, reason: "No SERP provider configured (SERP_PROVIDER unset)." };
  },
};
