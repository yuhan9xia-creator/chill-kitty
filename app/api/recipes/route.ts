import { createJsonCompletion } from "../_lib/openai";

export const runtime = "edge";

type FoodInput = { name?: string; emoji?: string; defId?: string; freshness?: number };

function bilingual(value: unknown, fallback = ""): { en: string; cn: string } {
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return { en: String(item.en || item.cn || fallback), cn: String(item.cn || item.en || fallback) };
  }
  const text = String(value || fallback);
  return { en: text, cn: text };
}

function fallbackRecipes(foods: FoodInput[], style: string) {
  const selected = [...foods]
    .sort((a, b) => Number(a.freshness ?? 1) - Number(b.freshness ?? 1))
    .slice(0, 3)
    .map(food => ({
      name: bilingual(food.name, "Ingredient"),
      id: food.defId || null,
      status: "sanctuary",
    }));
  if (style === "western") {
    return [
      {
        name: { en: "Roasted Sanctuary Vegetables", cn: "避难所烤时蔬" },
        description: { en: "A practical tray bake that uses fragile ingredients first.", cn: "优先使用临期食材的简单烤盘菜。" },
        ingredients: selected,
        steps: [{ en: "Cut the ingredients evenly.", cn: "将食材切成均匀大小。" }, { en: "Season and roast until tender.", cn: "调味后烤至软熟。" }],
        prepTime: "25 min",
      },
      {
        name: { en: "Quick Vegetable Soup", cn: "快手蔬菜汤" },
        description: { en: "A warm soup for using up mixed produce.", cn: "适合消耗多种剩余蔬菜的暖汤。" },
        ingredients: selected,
        steps: [{ en: "Simmer the ingredients in water or stock.", cn: "将食材放入清水或高汤中炖煮。" }, { en: "Season and serve warm.", cn: "调味后趁热享用。" }],
        prepTime: "20 min",
      },
    ];
  }
  return [
    {
      name: { en: "Home-Style Stir-Fry", cn: "家常炒时蔬" },
      description: { en: "A quick stir-fry that rescues the most fragile ingredients.", cn: "优先使用临期食材的快手家常小炒。" },
      ingredients: selected,
      steps: [{ en: "Slice the ingredients.", cn: "将食材切片备好。" }, { en: "Stir-fry over high heat and season.", cn: "大火翻炒并调味。" }],
      prepTime: "15 min",
    },
    {
      name: { en: "Mixed Ingredient Stew", cn: "暖心杂蔬炖" },
      description: { en: "A gentle stew made from your remaining ingredients.", cn: "用现有食材制作的一锅温暖炖菜。" },
      ingredients: selected,
      steps: [{ en: "Add the ingredients and a little water to a pot.", cn: "食材加少量清水一同入锅。" }, { en: "Cover and simmer until tender.", cn: "加盖炖煮至软熟入味。" }],
      prepTime: "25 min",
    },
  ];
}

export async function POST(request: Request) {
  const body = await request.json() as { food_list?: FoodInput[]; lang?: string; style?: string };
  const foods = Array.isArray(body.food_list) ? body.food_list.slice(0, 20) : [];
  const style = body.style === "western" ? "western" : "cn_cuisine";
  if (!foods.length) return Response.json({ recipes: [] });

  const prioritizedFoods = [...foods].sort(
    (a, b) => Number(a.freshness ?? 1) - Number(b.freshness ?? 1),
  );

  try {
    const result = await createJsonCompletion([
      {
        role: "system",
        content: "You are a practical zero-waste home-cooking assistant. Return valid JSON only. Favor believable everyday dishes over using every available ingredient. Every recipe must have natural English and Simplified Chinese versions; cn fields must contain Chinese, not duplicated English.",
      },
      {
        role: "user",
        content: `Available ingredients, ordered from most urgent to least urgent: ${JSON.stringify(prioritizedFoods)}\n` +
          `Cuisine style: ${style === "western" ? "Western home cooking" : "Chinese home cooking"}. ` +
          "Create exactly two realistic home-cooking recipes. For each recipe, choose only a small, naturally compatible subset of one to four supplied ingredients. " +
          "Do not use every available ingredient, do not add an ingredient merely to use it up, and never create strange combinations. " +
          "The two recipes should usually use different subsets. Prioritize lower-freshness ingredients when they fit naturally, but culinary coherence matters more than using everything. " +
          "Return {\"recipes\":[...]} with bilingual name and description objects, ingredients with bilingual name, id and status, " +
          "bilingual steps, and prepTime. List only ingredients actually used in that recipe. Use status sanctuary for supplied food and market for ordinary pantry additions.",
      },
    ]) as { recipes?: Array<Record<string, unknown>> };

    const recipes = (Array.isArray(result.recipes) ? result.recipes : []).slice(0, 2).map(recipe => ({
      name: bilingual(recipe.name, "Recipe"),
      description: bilingual(recipe.description, "A practical zero-waste recipe."),
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map((rawItem: unknown) => {
        const item = rawItem && typeof rawItem === "object"
          ? rawItem as Record<string, unknown>
          : {};
        return {
          name: bilingual(item.name, "Ingredient"),
          id: typeof item.id === "string" ? item.id : null,
          status: item.status === "sanctuary" ? "sanctuary" : "market",
        };
      }) : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps.map((step: unknown) => bilingual(step)) : [],
      prepTime: String(recipe.prepTime || "20 min"),
    }));
    return Response.json({ recipes: recipes.length ? recipes : fallbackRecipes(foods, style) });
  } catch {
    return Response.json({ recipes: fallbackRecipes(foods, style), fallback: true });
  }
}
