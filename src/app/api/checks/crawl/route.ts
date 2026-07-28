import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crawlSite } from "@/lib/crawler/crawl";

export const maxDuration = 60;

const Body = z.object({ websiteUrl: z.string().min(3) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "websiteUrl required" }, { status: 400 });
  }
  const bundle = await crawlSite(parsed.data.websiteUrl);
  return NextResponse.json(bundle);
}
