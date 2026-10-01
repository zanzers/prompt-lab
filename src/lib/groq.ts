export const GROQ_BASE = "https://api.groq.com/openai/v1";

// Heuristic: hide models that aren't for text chat
const NON_CHAT = ["whisper", "tts", "guard", "orpheus", "embed"];

export async function listChatModels(): Promise<string[]> {
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const models: { id: string; active?: boolean }[] = json?.data ?? [];

  return models
    .filter((m) => m.active !== false)
    .map((m) => m.id)
    .filter((id) => !NON_CHAT.some((w) => id.toLowerCase().includes(w)))
    .sort();
}


export function modelUnavailableMessage(
  requested: string,
  available: string[]
): string {
  const base = `"${requested}" is not available for this key. It may not exist, may have been retired, or may need a paid plan.`;

  if (available.length === 0) {
    return `${base} Could not load the list of available models.`;
  }

  return `${base} Models currently available: ${available.join(", ")}.`;
}