import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CHECKS } from "@/lib/registry";
import type { CheckId, CheckInput } from "@/lib/types";

// PageSpeed can take 60s+; other checks finish in seconds.
export const maxDuration = 120;

const Body = z.object({
  scan: z.object({
    brandName: z.string().min(1),
    websiteUrl: z.string().min(3),
    city: z.string().optional(),
    category: z.string().optional(),
    gbpHint: z.string().optional(),
    competitors: z.array(z.string()).optional(),
  }),
  crawl: z.unknown().optional(),
  priorResults: z.unknown().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ checkId: string }> }) {
  const { checkId } = await ctx.params;
  const check = CHECKS[checkId as CheckId];
  if (!check) {
    return NextResponse.json({ error: `unknown check: ${checkId}` }, { status: 404 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const result = await check.run(parsed.data as unknown as CheckInput);
  return NextResponse.json(result);
}
