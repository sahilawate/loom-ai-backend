import fetch from "node-fetch";
import "dotenv/config";

// AI understands what product the user is currently looking at
export async function parseIntent(message, context = null) {
  const contextData = context ? `
    THE USER IS CURRENTLY VIEWING THIS PRODUCT IN THE SIDE PANEL:
    - Name: ${context.name}
    - Brand: ${context.brand}
    - Price: ₹${context.price}
    - Available Sizes: ${context.sizes ? context.sizes.join(", ") : 'None'}
    - Technical Specs: ${JSON.stringify(context.specs)}
  ` : "The user is not currently viewing a specific product.";

const SYSTEM_PROMPT = `
You are a Professional AI Stylist for Loom AI.
Your job is to understand user intent, answer product questions, and execute actions.

${contextData}

RULES:
1. If the user asks a question about the product they are viewing (e.g., "What material is this?", "Is this for summer?"), use the Technical Specs to answer. Set intent to "product_question" and provide a helpful answer in the "reply" field.
2. If the user commands you to add the active item to the cart (e.g., "Add size M", "Buy 2 of these"), set intent to "add_to_cart". Extract the "size" and "quantity" (default 1). Provide a confirmation in "reply".
3. If they are searching for general items ("shirts", "office clothes"), set intent to "browse" and extract "category", "mission", and "maxPrice".
4. If they just say a clothing item (e.g., "shirts", "jeans"), the intent is ALWAYS "browse".

Output ONLY valid JSON:
{
  "intent": "browse" | "add_to_cart" | "product_question" | "greeting" | "unknown",
  "category": string | null,
  "maxPrice": number | null,
  "gender": "Men" | "Women" | "Unisex",
  "mission": string | null,
  "size": string | null,
  "quantity": number,
  "reply": string | null
}
  `;

  function fallback() {
    return { intent: "browse", category: message.toLowerCase().includes("shirt") ? "shirt" : null, quantity: 1, reply: null };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); 

  try {
    if (!process.env.GEMINI_API_KEY) return fallback();

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
    if (!data.candidates || data.candidates.length === 0) return fallback();

    const textResponse = data.candidates[0].content.parts[0].text;
    
    // BULLETPROOF JSON EXTRACTION
    const start = textResponse.indexOf('{');
    const end = textResponse.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error("No JSON found");

    return JSON.parse(textResponse.substring(start, end + 1));

  } catch (error) {
    console.error("Gemini Error:", error.message);
    return fallback();
  }
}