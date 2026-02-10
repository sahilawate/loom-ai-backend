import { extractIntentAndEntities } from "./nlp.js";
import { findProducts } from "./productResolver.js";
import { logAgent } from "../logger.js";

export async function runAI(sessionId, message) {
  const parsed = extractIntentAndEntities(message);
  await logAgent(sessionId, "SalesAgent", "Parsed", parsed);

  // greeting
  if (parsed.intent === "greeting") {
    return {
      reply:
        "Hi 👋 Tell me what you’re looking for — for example, “jeans under 2000” or “black blazer”.",
      products: []
    };
  }

  // price without category
  if (parsed.intent === "clarify") {
    return {
      reply:
        "Could you tell me which product you’re looking for? For example, “shirts under 2000”.",
      products: []
    };
  }

  // unknown
  if (parsed.intent === "unknown") {
    return {
      reply:
        "I didn’t recognise that product. We currently have shirts, t-shirts, jeans, blazers and dresses.",
      products: []
    };
  }

  // browse
  const products = await findProducts(parsed);

  if (products.length === 0) {
    return {
      reply:
        `I couldn’t find any ${parsed.category}` +
        (parsed.maxPrice ? ` under ₹${parsed.maxPrice}` : "") +
        ". You can try increasing the budget.",
      products: []
    };
  }

  const replies = [
    "These match what you’re looking for",
    "Here are some options you might like",
    "I found these based on your criteria"
  ];

  return {
    reply:
      replies[Math.floor(Math.random() * replies.length)] +
      (parsed.maxPrice ? ` (under ₹${parsed.maxPrice})` : "") +
      ".",
    products
  };
}