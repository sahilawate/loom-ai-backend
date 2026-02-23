import fetch from "node-fetch";
import "dotenv/config";

export async function parseIntent(message, context = null) {
  // 🟢 CRITICAL UI INTERCEPT: Catch automated messages before AI processing
  if (message.includes("Please summarize the details and specifications of the")) {
      return { 
          intent: "product_question", 
          reply: `You're currently looking at the ${context?.name || 'selected item'}. It features premium craftsmanship and is priced at ₹${context?.price || 'its standard price'}. Would you like me to add it to your cart? Please specify a size and quantity if you do!`, 
          category: null, style: null, maxPrice: null, minPrice: null, size: null, quantity: 1 
      };
  }

  const contextData = context ? `
    THE USER IS CURRENTLY VIEWING THIS PRODUCT IN THE SIDE PANEL:
    - Name: ${context.name}
    - Brand: ${context.brand}
    - Price: ₹${context.price}
    - Available Sizes: ${context.sizes ? context.sizes.join(", ") : 'None'}
    - User's Currently Selected UI Size: ${context.userSelectedSize || 'None'}
    - User's Currently Selected UI Qty: ${context.userSelectedQty || 1}
  ` : "The user is not currently viewing a specific product.";

  const SYSTEM_PROMPT = `
You are a highly professional AI Stylist. Understand user intent, converse naturally, and extract filters.

${contextData}

RULES:
1. CHECKOUT/CLEAR: Handle "buy now", "checkout", "clear cart".
2. ADDING TO CART: Extract size and quantity. 
   -> IF the user says "add selection" or doesn't mention a quantity, use 'User's Currently Selected UI Qty'.
   -> IF NO SIZE IS FOUND: Set intent to "product_question" and ASK the user which size they want. 
   -> If the user just replies with a size (e.g., "XL", "38", "size M"), treat it as "add_to_cart".
3. BROWSING & FILTERS: Extract "category" (shirt, tshirt, jeans, blazer, dress). 
   -> Extract "maxPrice" (e.g. "below 600", "under 1000") and "minPrice" ("above 500").
   -> Extract "style" (formal, casual, party).
   -> FOLLOW-UP MEMORY: If the user JUST types a number, a price, or a style (e.g., "700", "i want below 600", "casual"), treat this as a "browse" intent and set category to "items".
   -> IMPORTANT: If the user says "wear", "outfit", or "clothes", ALWAYS set category to "items" unless a specific clothing type is named. DO NOT assume the category from the currently viewed product.

Output strictly valid JSON:
{
  "intent": "browse" | "add_to_cart" | "product_question" | "greeting" | "checkout" | "clear_cart" | "unknown",
  "reply": "Conversational reply.",
  "category": "shirt" | "tshirt" | "jeans" | "blazer" | "dress" | "items" | null,
  "style": "casual" | "formal" | "party" | null,
  "maxPrice": number | null,
  "minPrice": number | null,
  "size": string | null,
  "quantity": number
}
`;

  function fallback(errReason) {
    console.warn(`[AI Warning] Smart Fallback. Reason: ${errReason}`);
    const lowerMsg = message.toLowerCase();
    
    // Normalize word numbers to digits
    let normalizedMsg = lowerMsg.replace(/\bone\b/g, "1").replace(/\btwo\b/g, "2")
        .replace(/\bthree\b/g, "3").replace(/\bfour\b/g, "4").replace(/\bfive\b/g, "5");

    if (lowerMsg.includes("clear") || lowerMsg.includes("empty")) return { intent: "clear_cart", reply: "I've emptied your cart for you!", quantity: 1 };
    if (lowerMsg.includes("remove") || lowerMsg.includes("delete")) return { intent: "remove_item", reply: "To ensure accuracy, please click the 'X' next to the item in your cart panel to remove it.", quantity: 1 };

    if (lowerMsg.match(/(checkout|pay|proceed|view cart|buy it now|show cart|take me to cart|go to cart|open cart)/i)) {
        return { intent: "checkout", reply: "Taking you to your cart right now!", quantity: 1 };
    }

    // 1. EXTRACT QUANTITY FIRST 
    let extractedQty = context?.userSelectedQty || 1;
    const qtyMatch = normalizedMsg.match(/\b(\d+)\s*(?:qty|quantity|units?|pieces?|items?|of|blazers?|shirts?|jeans?|pants?)\b/i) || 
                     normalizedMsg.match(/\b(?:add|buy|get|select|put)\s*(\d+)\b/i) ||
                     normalizedMsg.match(/\bqty\s*(\d+)\b/i) ||
                     normalizedMsg.match(/^(?:add\s*)?(\d+)$/i);
                     
    if (qtyMatch) {
        extractedQty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3] || qtyMatch[0], 10);
    }

    // 2. EXTRACT SIZE 
    let extractedSize = context?.userSelectedSize || null; 
    const explicitSize = normalizedMsg.match(/\bsize\s*[:\-]?\s*(s|m|l|xl|xxl|xxxl|[2-4][0-9])\b/i) || 
                         normalizedMsg.match(/\b(s|m|l|xl|xxl|xxxl|[2-4][0-9])\s*size(?:d)?\b/i);

    let potentialSizes = [...normalizedMsg.matchAll(/\b(s|m|l|xl|xxl|xxxl|[2-4][0-9])\b/gi)].map(m => m[1].toUpperCase());

    if (explicitSize) {
        extractedSize = (explicitSize[1] || explicitSize[2]).toUpperCase().trim();
    } else {
        for (let pSize of potentialSizes) {
            if (parseInt(pSize, 10) !== extractedQty) {
                if (context?.sizes && context.sizes.includes(pSize)) {
                    extractedSize = pSize;
                    break;
                } else if (isNaN(parseInt(pSize, 10))) {
                    extractedSize = pSize;
                    break;
                }
            }
        }
    }

    const isJustSize = normalizedMsg.trim().match(/^(s|m|l|xl|xxl|xxxl|[2-4][0-9])$/i);

    // 3. ADD TO CART ROUTING
    const isAddCommand = lowerMsg.match(/(add|buy|cart|select|ok|yes|get)/i) || isJustSize || 
                         (extractedSize && lowerMsg.match(/(units?|pieces?|of)/i)) ||
                         (extractedSize && normalizedMsg.length < 25 && !lowerMsg.match(/(what|explain|detail|how many|available)/i));

    if (isAddCommand && context) {
        if (!extractedSize && context.sizes && context.sizes[0] !== 'Universal') {
            return { intent: "product_question", reply: `Which size would you like? Available sizes: ${context.sizes.join(", ")}.`, quantity: 1 };
        }
        if (extractedSize && context.sizes && !context.sizes.includes(extractedSize) && context.sizes[0] !== 'Universal') {
            return { intent: "product_question", reply: `I'm sorry, size ${extractedSize} isn't available. We have: ${context.sizes.join(", ")}.`, quantity: 1 };
        }
        return { intent: "add_to_cart", reply: `Added ${extractedQty} unit(s) of size ${extractedSize || 'Universal'} to cart!`, quantity: extractedQty, size: extractedSize || 'Universal' };
    }

    // 4. PRODUCT QUESTIONS
    if (context && lowerMsg.match(/(explain|feature|detail|stock|how many|what sizes?|available sizes?)/i)) {
        return { intent: "product_question", reply: `The ${context.name} is priced at ₹${context.price}. We currently have ${context.quantity} in stock. Available sizes are: ${context.sizes ? context.sizes.join(", ") : 'Standard'}.`, quantity: 1 };
    }

    // 5. BROWSING & FILTERS
    let maxPrice = null; let minPrice = null; let style = null; let cat = null; let resetCat = false;
    
    const maxMatch = lowerMsg.match(/(?:under|below|less than|max|within)\s*(?:rs\.?|inr|₹|\$)?\s*(\d+)/i);
    if (maxMatch) maxPrice = parseInt(maxMatch[1], 10);
    else {
        const rawNumberMatch = lowerMsg.match(/^(?:rs\.?|inr|₹|\$)?\s*(\d{3,5})\s*$/i);
        if (rawNumberMatch && parseInt(rawNumberMatch[1], 10) >= 100) maxPrice = parseInt(rawNumberMatch[1], 10);
    }
    
    const minMatch = lowerMsg.match(/(?:above|over|more than|min)\s*(?:rs\.?|inr|₹|\$)?\s*(\d+)/i);
    if (minMatch) minPrice = parseInt(minMatch[1], 10);

    const styleMatch = lowerMsg.match(/(casual|formal|party|office|gym|sports|wedding|beach|summer|winter)/i);
    if (styleMatch) style = styleMatch[1].toLowerCase();

    if (lowerMsg.match(/(t[\s-]?shirt)/i)) cat = "tshirt";
    else if (lowerMsg.match(/(shirt)/i)) cat = "shirt";
    else if (lowerMsg.match(/(jeans|pant)/i)) cat = "jeans";
    else if (lowerMsg.match(/(blazer|blazor|suit)/i)) cat = "blazer";
    else if (lowerMsg.match(/(dress)/i)) cat = "dress";
    
    if (lowerMsg.match(/(outfit|wear|clothes|look)/i)) {
        resetCat = true;
        if (!cat) cat = "items"; 
    }

    if (maxPrice || minPrice || style || cat || resetCat) {
        return { intent: "browse", category: cat || "items", style: style, maxPrice: maxPrice, minPrice: minPrice, quantity: 1, resetMemory: resetCat };
    }

    if (lowerMsg.match(/\b(hi+|hello+|hey+)\b/i)) return { intent: "greeting", reply: "Hello! I'm your Loom AI Stylist. I can find products, filter by budget, and manage your cart.", quantity: 1 };
    
    return { intent: "unknown", reply: "I can help you find products, filter by budget, or go to checkout. What do you need?", quantity: 1 };
  }

  const modelName = "gemini-1.5-flash-latest"; 
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); 

  try {
    if (!process.env.GEMINI_API_KEY) return fallback("API Key Missing");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + `\nUser Input: "${message}"` }] }] })
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.error) return fallback(data.error.message); 
    if (!data.candidates || data.candidates.length === 0) return fallback("Empty response");

    let textResponse = data.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = textResponse.indexOf('{'); const end = textResponse.lastIndexOf('}');
    
    let parsed = JSON.parse(textResponse.substring(start, end + 1));

    // If user says "wear" or "outfit" without explicitly naming a clothing type in this new sentence, wipe the category!
    const lowerInput = message.toLowerCase();
    if (lowerInput.match(/(outfit|wear|clothes|look)/i)) {
        parsed.resetMemory = true;
        if (!lowerInput.match(/(shirt|jeans|pant|blazer|dress)/i)) {
            parsed.category = "items";
        }
    }

    return parsed;
  } catch (error) {
    return fallback(error.message);
  }
}