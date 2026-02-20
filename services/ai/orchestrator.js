// 🟢 DELETED nlp.js IMPORT. NOW USING THE GEMINI BRAIN.
import { parseIntent } from "./intentParser.js";
import { findProducts } from "./productResolver.js";
import { logAgent } from "../logger.js";

export async function runAI(sessionId, message) {
  // Await the Gemini Parser
  const parsed = await parseIntent(message);
  await logAgent(sessionId, "StylistAgent", "Parsed Request", parsed);

  if (parsed.intent === "greeting") {
    return { reply: "Hi 👋 I’m Loom AI. Tell me what you’re looking for — for example, 'office shirts under 2000' or 'wedding blazer'.", products: [] };
  }

  if (parsed.intent === "unknown") {
    return { reply: "I didn’t quite catch that. I can help you find shirts, t-shirts, jeans, blazers, and dresses. What do you need?", products: [] };
  }

  // Browse Logic
  const products = await findProducts(parsed);

  if (products.length === 0) {
    return {
      reply: `I couldn’t find any ${parsed.category || 'items'} matching that exact description.` + (parsed.maxPrice ? ` Try a budget above ₹${parsed.maxPrice}.` : ""),
      products: []
    };
  }

  // Agentic Dynamic Replies
  let replyString = `Here are the best ${parsed.category || 'options'} I found`;
  if (parsed.mission) replyString += ` for your ${parsed.mission}`;
  if (parsed.maxPrice) replyString += ` under ₹${parsed.maxPrice}`;
  replyString += `!`;

  return { reply: replyString, products };
}