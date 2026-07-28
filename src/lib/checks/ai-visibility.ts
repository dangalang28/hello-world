import type { Finding } from "@/lib/types";
import { complete, getLlm } from "@/lib/llm";
import { defineCheck, pass } from "./util";

export const aiVisibilityCheck = defineCheck(
  { id: "ai-visibility", name: "AI Search Visibility", dimension: "ai", requires: [] },
  async ({ scan }) => {
    if (!getLlm()) {
      return {
        status: "manual" as const,
        findings: [],
        note: "ANTHROPIC_API_KEY not configured — AI visibility audited via manual checklist.",
        manualChecklist: [
          { step: `Ask ChatGPT, Claude, and Google AI Mode: \"What do you know about ${scan.brandName}${scan.city ? ` in ${scan.city}` : ""}?\"`, lookFor: "Does the AI know the business exists? Are the details (services, location) accurate?" },
          { step: `Ask: \"Recommend a ${scan.category ?? "business like this"}${scan.city ? ` in ${scan.city}` : ""}\".`, lookFor: "Whether the brand is mentioned at all, and which competitors are recommended instead." },
        ],
      };
    }

    const where = scan.city ? ` in ${scan.city}` : "";
    const prompt = `You are auditing how AI search assistants perceive a local brand, using only your trained knowledge (do not browse).

Brand: ${scan.brandName}${where}
Website: ${scan.websiteUrl}
${scan.category ? `Category: ${scan.category}` : ""}

Answer these three questions concisely, then give a verdict.
1. What do you know about this specific business?
2. If someone asked you to recommend a ${scan.category ?? "business of this type"}${where}, would this brand come up?
3. Is anything you know about it potentially outdated or wrong?

End with exactly one line: VERDICT: KNOWN | VAGUE | UNKNOWN`;

    const answer = await complete(prompt, 800);
    if (!answer) {
      return {
        status: "error" as const,
        findings: [],
        note: "AI visibility probe failed (API error).",
      };
    }

    const verdict = answer.match(/VERDICT:\s*(KNOWN|VAGUE|UNKNOWN)/i)?.[1]?.toUpperCase() ?? "VAGUE";
    const findings: Finding[] = [];

    if (verdict === "UNKNOWN") {
      findings.push({
        id: "ai.unknown",
        dimension: "ai",
        severity: "warning",
        title: "AI assistants don't know this brand",
        evidence: "A model probe could not identify the business from its trained knowledge.",
        recommendation: "AI search draws on the public web: strengthen the entity footprint (Wikipedia-grade citations aren't needed — consistent GBP, schema, directory listings, and press mentions are).",
        impact: 3,
        effort: 4,
      });
    } else if (verdict === "VAGUE") {
      findings.push({
        id: "ai.vague",
        dimension: "ai",
        severity: "opportunity",
        title: "AI assistants have only vague knowledge of the brand",
        evidence: "A model probe recognized the brand weakly or with low confidence.",
        recommendation: "Publish consistent, crawlable brand facts (schema, about page, GBP) so AI search systems can describe the business accurately.",
        impact: 3,
        effort: 3,
      });
    } else {
      findings.push(pass({ id: "ai.known", dimension: "ai", title: "AI assistants recognize the brand", evidence: "A model probe identified the business from trained knowledge." }));
    }

    return { status: "ok" as const, findings, raw: { probe: answer.slice(0, 2000), verdict } };
  },
);
