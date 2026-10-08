import { createJsonCompletion } from "../../_lib/openai";

export const runtime = "edge";

export async function POST(request: Request) {
  const body = await request.json() as { candidates?: unknown[]; lang?: string };
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 8) : [];
  if (!candidates.length) return Response.json({ notes: [] });
  try {
    const result = await createJsonCompletion([
      {
        role: "system",
        content: "Write short, varied messages from fading food spirits. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Candidates: ${JSON.stringify(candidates)}. Language: ${body.lang === "cn" ? "Simplified Chinese" : "English"}. ` +
          "Return {\"notes\":[...]} where each note has id, senderName, senderEmoji, message (maximum 15 words), rarity (Common or Rare), and archetype.",
      },
    ]) as { notes?: unknown[] };
    return Response.json({ notes: Array.isArray(result.notes) ? result.notes : [] });
  } catch {
    return Response.json({ notes: [] });
  }
}
