import { z } from "zod";
import type { CrawlBundle, Dimension, FixAsset, GbpData, RoadmapItem, ScanInput, ScanNarrative } from "@/lib/types";
import { getLlm, LLM_MODEL } from "@/lib/llm";

const ResponseSchema = z.object({
  gbpDescription: z.string(),
  metaRewrites: z.array(
    z.object({ url: z.string(), title: z.string(), description: z.string() }),
  ),
  executiveSummary: z.string(),
  perDimension: z.record(z.string(), z.string()),
});

export interface LlmCopyResult {
  assets: FixAsset[];
  narrative: ScanNarrative;
}

/**
 * One batched LLM call producing GBP description, meta rewrites, and report
 * narrative. Returns null on any failure (no key, API error, invalid JSON
 * after one retry) — the report ships deterministic-only in that case.
 */
export async function generateLlmCopy(
  input: ScanInput,
  gbp: GbpData | undefined,
  crawl: CrawlBundle | undefined,
  roadmap: RoadmapItem[],
  dimensionSummary: string,
): Promise<LlmCopyResult | null> {
  const client = getLlm();
  if (!client) return null;

  const pages = (crawl?.pages ?? []).slice(0, 8).map((p) => ({
    url: p.url,
    currentTitle: p.title,
    currentDescription: p.metaDescription,
    h1: p.h1s[0] ?? null,
  }));

  const prompt = `You are an expert local-SEO copywriter. Produce copy for this business as strict JSON.

Business: ${input.brandName}${input.city ? `, ${input.city}` : ""}
Category: ${input.category ?? gbp?.categories?.[0] ?? "unknown"}
Website: ${input.websiteUrl}
${gbp ? `Google Business Profile: ${gbp.name}, ${gbp.formattedAddress ?? ""}, rating ${gbp.rating ?? "n/a"} (${gbp.reviewCount ?? 0} reviews)` : "No GBP data available."}

Audit context (top issues found):
${roadmap.slice(0, 6).map((r) => `- ${r.finding.title}: ${r.finding.evidence}`).join("\n")}

Dimension scores:
${dimensionSummary}

Crawled pages needing meta rewrites:
${JSON.stringify(pages, null, 2)}

Return ONLY a JSON object (no markdown fences) with exactly these keys:
{
  "gbpDescription": "compelling Google Business Profile description, 650-740 characters, plain text, no keyword stuffing, mention city and core services",
  "metaRewrites": [{ "url": "...", "title": "50-60 chars, brand + primary topic", "description": "140-160 chars, sells the click" }],
  "executiveSummary": "3-4 sentence plain-English summary of the brand's Google visibility for a business owner, referencing the scores",
  "perDimension": { "<dimension key from the scores list>": "1-2 sentence narrative for that report section" }
}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await client.messages.create({
        model: LLM_MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") continue;
      const cleaned = text.text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
      const parsed = ResponseSchema.parse(JSON.parse(cleaned));

      const assets: FixAsset[] = [
        {
          id: "fix.gbp-description",
          kind: "gbp-description",
          title: "Google Business Profile description (paste into the GBP dashboard)",
          content: parsed.gbpDescription.slice(0, 750),
          format: "text",
          appliesTo: "Google Business Profile",
          generatedBy: "llm",
        },
        {
          id: "fix.meta",
          kind: "meta-rewrites",
          title: "Meta title & description rewrites",
          content: parsed.metaRewrites
            .map((m) => `URL: ${m.url}\n<title>${m.title.slice(0, 65)}</title>\n<meta name="description" content="${m.description.slice(0, 165)}">`)
            .join("\n\n"),
          format: "html",
          generatedBy: "llm",
        },
      ];

      return {
        assets,
        narrative: {
          executiveSummary: parsed.executiveSummary,
          perDimension: parsed.perDimension as Partial<Record<Dimension, string>>,
        },
      };
    } catch {
      // retry once, then give up
    }
  }
  return null;
}
