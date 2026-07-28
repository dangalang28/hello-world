import type { Check, CheckId, CheckMeta } from "@/lib/types";
import { indexabilityCheck } from "@/lib/checks/indexability";
import { technicalSeoCheck } from "@/lib/checks/technical-seo";
import { structuredDataCheck } from "@/lib/checks/structured-data";
import { pagespeedCheck } from "@/lib/checks/pagespeed";
import { gbpCheck } from "@/lib/checks/gbp";
import { napConsistencyCheck } from "@/lib/checks/nap-consistency";
import { keywordsCheck } from "@/lib/checks/keywords";
import { serpCheck } from "@/lib/checks/serp";
import { aiVisibilityCheck } from "@/lib/checks/ai-visibility";

export const CHECKS: Record<CheckId, Check> = {
  indexability: indexabilityCheck,
  "technical-seo": technicalSeoCheck,
  "structured-data": structuredDataCheck,
  pagespeed: pagespeedCheck,
  gbp: gbpCheck,
  "nap-consistency": napConsistencyCheck,
  keywords: keywordsCheck,
  serp: serpCheck,
  "ai-visibility": aiVisibilityCheck,
};

/** Serializable metadata for the client orchestrator (no run functions). */
export const CHECK_METAS: CheckMeta[] = Object.values(CHECKS).map(({ id, name, dimension, requires }) => ({
  id,
  name,
  dimension,
  requires,
}));
