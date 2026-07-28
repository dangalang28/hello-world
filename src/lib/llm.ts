import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = "claude-sonnet-5";

/** Returns an Anthropic client, or null when no API key is configured. */
export function getLlm(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

/** One-shot text completion helper. Returns null on any failure — callers must degrade gracefully. */
export async function complete(prompt: string, maxTokens = 1500): Promise<string | null> {
  const client = getLlm();
  if (!client) return null;
  try {
    const msg = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch {
    return null;
  }
}
