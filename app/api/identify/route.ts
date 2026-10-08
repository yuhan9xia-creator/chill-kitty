import { FOOD_DEFINITIONS } from "../../../chill-kitty/constants";
import { createJsonCompletion } from "../_lib/openai";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    const lang = form.get("lang") === "cn" ? "cn" : "en";
    const mode = form.get("mode") === "receipt" ? "receipt" : "food";
    if (!(image instanceof File)) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }
    if (image.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Image is too large." }, { status: 413 });
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const imageBase64 = btoa(binary);
    const allowed = Object.values(FOOD_DEFINITIONS).map(food => ({
      id: food.id,
      en: food.name.en,
      cn: food.name.cn,
      quantityKind: food.quantityKind || "countable",
    }));

    const sourceRule = mode === "receipt"
      ? "Read the shopping receipt using OCR. Ignore prices, totals, coupons, fees, packaging, and non-food goods."
      : "Identify only food that is visibly present in the photograph.";
    const result = await createJsonCompletion([
      {
        role: "system",
        content: `You identify food for a food-waste app. ${sourceRule}\n` +
          `Only use IDs from this exact list: ${JSON.stringify(allowed)}\n` +
          "Return one JSON object with a foods array. Each food has id, vitality (0 to 1), quantity, and amount_percent. " +
          "Use quantity for countable foods. Use amount_percent for uncountable foods. If nothing matches, return {\"foods\":[]}. " +
          `The interface language is ${lang === "cn" ? "Simplified Chinese" : "English"}.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: mode === "receipt" ? "Read this receipt and identify matching foods." : "Identify matching foods in this image." },
          { type: "image_url", image_url: { url: `data:${image.type || "image/jpeg"};base64,${imageBase64}`, detail: "high" } },
        ],
      },
    ]) as { foods?: Array<Record<string, unknown>> };

    const foods = (Array.isArray(result.foods) ? result.foods : []).flatMap(raw => {
      const id = String(raw.id || "").toLowerCase().trim();
      const definition = FOOD_DEFINITIONS[id];
      if (!definition) return [];
      const quantityKind = definition.quantityKind || "countable";
      const vitality = Math.max(0, Math.min(1, Number(raw.vitality ?? 1)));
      const quantity = quantityKind === "countable"
        ? Math.max(1, Math.round(Number(raw.quantity ?? 1)))
        : 1;
      const amountPercent = quantityKind === "uncountable"
        ? Math.max(0, Math.min(100, Math.round(Number(raw.amount_percent ?? 100))))
        : null;
      return [{
        id,
        name: definition.name,
        emoji: definition.emoji || "🍽️",
        category: definition.category,
        bestStorage: definition.bestStorage,
        lore: definition.lore,
        secret: definition.realWorldSecret,
        vitality,
        quantityKind,
        quantity,
        amount_percent: amountPercent,
      }];
    });

    return Response.json({ foods });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food recognition failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
