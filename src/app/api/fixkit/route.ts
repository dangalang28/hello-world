import { NextRequest, NextResponse } from "next/server";
import type { CrawlBundle, FixAsset, GbpData, RoadmapItem, ScanInput, ScanNarrative } from "@/lib/types";
import { buildJsonLdAsset } from "@/lib/fixkit/jsonld";
import { buildNapBlockAsset } from "@/lib/fixkit/nap-block";
import { buildRobotsAsset, buildSitemapNoteAsset } from "@/lib/fixkit/robots-sitemap";
import { generateLlmCopy } from "@/lib/fixkit/llm-copy";

export const maxDuration = 90;

interface FixkitRequest {
  input: ScanInput;
  gbp?: GbpData;
  crawl?: CrawlBundle;
  roadmap: RoadmapItem[];
  dimensionSummary: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as FixkitRequest | null;
  if (!body?.input?.brandName) {
    return NextResponse.json({ error: "input required" }, { status: 400 });
  }

  const assets: FixAsset[] = [];
  assets.push(buildJsonLdAsset(body.input, body.gbp, body.crawl));
  const nap = buildNapBlockAsset(body.input, body.gbp, body.crawl);
  if (nap) assets.push(nap);
  const robots = buildRobotsAsset(body.crawl);
  if (robots) assets.push(robots);
  const sitemapNote = buildSitemapNoteAsset(body.crawl);
  if (sitemapNote) assets.push(sitemapNote);

  let narrative: ScanNarrative | undefined;
  const llm = await generateLlmCopy(
    body.input,
    body.gbp,
    body.crawl,
    body.roadmap ?? [],
    body.dimensionSummary ?? "",
  );
  if (llm) {
    assets.push(...llm.assets);
    narrative = llm.narrative;
  }

  return NextResponse.json({ fixKit: assets, narrative });
}
