// backend/services/ai/intentParser.js
const SYSTEM_PROMPT = `
You are an AI shopping assistant for a fashion store.
Your job:
- Understand user intent and map it to our supported categories.
- Supported categories: "shirt", "tshirt", "jeans", "blazer", "dress"
- **CRITICAL Mapping Rules**:
  * "pant", "pants", "trouser", "denim", "bottoms" -> map to "jeans"
  * "tee", "top" -> map to "tshirt"
  * "coat", "suit jacket" -> map to "blazer"
  * "gown" -> map to "dress"
- Return ONLY valid JSON.

Output JSON format:
{
  "category": "shirt" | "tshirt" | "jeans" | "blazer" | "dress" | null,
  "maxPrice": number | null,
  "size": "S" | "M" | "L" | null,
  "intent": "browse" | "buy" | "question",
  "confidence": "high" | "medium" | "low"
}
`;

function keywordFallback(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes("buy") || lower.includes("checkout")) return { intent: "buy", category: null };

  const priceMatch = lower.match(/(\d+)/);
  const maxPrice = priceMatch ? parseInt(priceMatch[0]) : null;

  let category = null;
  // Keyword Mapping logic for Fallback
  if (lower.includes("tshirt") || lower.includes("t-shirt") || lower.includes("tee")) {
    category = "tshirt";
  } else if (lower.includes("shirt")) {
    category = "shirt";
  } else if (lower.includes("jean") || lower.includes("pant") || lower.includes("trouser") || lower.includes("denim")) {
    category = "jeans";
  } else if (lower.includes("blazer") || lower.includes("coat")) {
    category = "blazer";
  } else if (lower.includes("dress") || lower.includes("gown")) {
    category = "dress";
  }

  if (category) return { intent: "browse", category, maxPrice };
  
  return { intent: "question", category: null };
}

export async function parseIntent(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); 

  try {
    if (!process.env.GEMINI_API_KEY) return keywordFallback(message);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + `\nUser Input: "${message}"` }] }]
        })
      }
    );

    clearTimeout(timeoutId);

    const data = await res.json();
    if (!data.candidates || data.candidates.length === 0) return keywordFallback(message);

    const textResponse = data.candidates[0].content.parts[0].text;
    const jsonString = textResponse.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonString);

  } catch (error) {
    return keywordFallback(message);
  }
}