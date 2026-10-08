type ChatMessage = {
  role: "system" | "user";
  content: string | Array<Record<string, unknown>>;
};

function extractJson(content: string): unknown {
  const cleaned = content.replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const object = cleaned.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);
    const array = cleaned.match(/\[[\s\S]*\]/);
    if (array) return JSON.parse(array[0]);
    throw new Error("The AI response was not valid JSON.");
  }
}

export async function createJsonCompletion(messages: ChatMessage[]): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      messages,
      reasoning_effort: "none",
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");
  return extractJson(content);
}
