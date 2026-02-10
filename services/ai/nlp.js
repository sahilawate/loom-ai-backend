export function extractIntentAndEntities(message) {
  const text = (message || "").toLowerCase().trim();

  // greeting / empty
  if (!text || ["hi", "hello", "hey", "hhii"].includes(text)) {
    return { intent: "greeting" };
  }

  const categoryMap = {
    tshirt: ["tshirt", "t-shirt", "t shirts", "tee"],
    shirt: ["shirt", "shirts"],
    jeans: ["jeans", "jean", "pant", "pants", "denim"],
    blazer: ["blazer", "blazers", "blazor", "coat"],
    dress: ["dress", "dresses"]
  };

  let category = null;
  for (const [key, words] of Object.entries(categoryMap)) {
    if (words.some(w => text.includes(w))) {
      category = key;
      break;
    }
  }

  // price
  let maxPrice = null;
  const priceMatch = text.match(/(under|below|less than)\s*(₹?\s*)?(\d+)/);
  if (priceMatch) maxPrice = Number(priceMatch[3]);

  // 🚨 PRICE WITHOUT CATEGORY IS INVALID
  if (!category && maxPrice !== null) {
    return {
      intent: "clarify",
      reason: "price_without_category"
    };
  }

  if (!category) {
    return { intent: "unknown" };
  }

  return {
    intent: "browse",
    category,
    maxPrice
  };
}
