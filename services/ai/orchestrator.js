import { parseIntent } from "./intentParser.js";
import { findProducts } from "./productResolver.js";
import { calculateLoyalty } from "./loyaltyAgent.js";
import { pool } from "../../db/index.js";

const sessionMemory = {};

export async function runAI(sessionId, message, contextProduct) {
  const intent = await parseIntent(message, contextProduct);
  
  // 🟢 FOLLOW-UP MEMORY LOGIC 
  let usedMemory = false;
  if (intent.intent === "browse" && intent.category === "items" && !intent.resetMemory && (intent.maxPrice || intent.minPrice || intent.style)) {
      if (sessionMemory[sessionId]?.lastCategory) {
          intent.category = sessionMemory[sessionId].lastCategory;
          usedMemory = true;
      }
  }
  
  if (intent.intent === "browse" && intent.category !== "items" && !intent.resetMemory) {
      sessionMemory[sessionId] = { lastCategory: intent.category };
  } else if (intent.resetMemory) {
      sessionMemory[sessionId] = null; // Clear memory if they ask for broad "wear" or "outfits"
  }

  await pool.query(
    "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Sales Agent', 'INFER_INTENT', $2)",
    [sessionId, JSON.stringify(intent)]
  );

  if (intent.intent === "greeting" || intent.intent === "product_question") return { reply: intent.reply, products: [] };
  
  if (intent.intent === "clear_cart") {
      await pool.query("DELETE FROM cart_items WHERE session_id = $1", [sessionId]);
      return { reply: intent.reply || "I've successfully emptied your cart.", products: [], action: { type: "REFRESH_CART" } };
  }
  if (intent.intent === "remove_item") {
      return { reply: intent.reply || "To remove a specific item, please click the 'X' next to it in your cart panel!", products: [] };
  }
  if (intent.intent === "checkout") {
      return { reply: intent.reply || "Taking you to your cart right now!", products: [], action: { type: "CHECKOUT" } };
  }

  // 🟢 STRICT VALIDATION GATEKEEPER (ADD TO CART)
  if (intent.intent === "add_to_cart" && contextProduct) {
      const requiredSizes = contextProduct.sizes || [];
      const hasSizes = requiredSizes.length > 0 && requiredSizes[0] !== 'Universal';

      let requestedSize = intent.size ? intent.size.toUpperCase() : null;
      if ((!requestedSize || requestedSize === "NULL" || requestedSize === "UNIVERSAL") && contextProduct.userSelectedSize) {
          requestedSize = contextProduct.userSelectedSize.toUpperCase();
      }

      if (hasSizes) {
          if (!requestedSize || requestedSize === "NULL" || requestedSize === "NONE") {
              return { reply: `Which size would you like to add? Available sizes for the ${contextProduct.name} are: ${requiredSizes.join(", ")}.`, products: [], action: null };
          }
          if (!requiredSizes.includes(requestedSize)) {
              return { reply: `I'm sorry, size ${requestedSize} is currently unavailable for this product. Please choose from: ${requiredSizes.join(", ")}.`, products: [], action: null };
          }
      }
      
      let finalQty = intent.quantity || 1;
      const lowerMsg = message.toLowerCase();
      const hasSelectionKeyword = lowerMsg.includes("selection") || lowerMsg.includes("selected") || lowerMsg.includes("this");
      const hasExplicitNumber = /\b(\d+|one|two|three|four|five)\b/.test(lowerMsg.replace(/\b(s|m|l|xl|xxl|38|40|42|44|46|30|32|34|36)\b/g, ''));

      if (finalQty === 1 && contextProduct.userSelectedQty > 1 && !hasExplicitNumber) {
          finalQty = contextProduct.userSelectedQty;
      }
      if (hasSelectionKeyword && !hasExplicitNumber) {
          finalQty = contextProduct.userSelectedQty || 1;
      }

      const finalSize = requestedSize || 'Universal';

      // 🟢 LOYALTY TRIGGER ON CART ADDITION
      let loyaltyMessage = "";
      if (contextProduct.price) {
          const loyalty = calculateLoyalty(contextProduct.price * finalQty);
          if (loyalty.discount > 0) {
               await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Loyalty Agent', 'APPLY_DISCOUNT', $2)", [sessionId, JSON.stringify(loyalty)]);
               loyaltyMessage = `\n\n✨ Good news! You qualify for a ₹${loyalty.discount} ${loyalty.tier} Tier discount on this order!`;
          }
      }

      return { 
        reply: `Perfect! I've added ${finalQty} unit(s) of size ${finalSize} to your cart.${loyaltyMessage}`, 
        products: [], action: { type: "ADD_TO_CART", size: finalSize, quantity: finalQty, variantId: contextProduct.variant_id }
      };
  }

  if (intent.intent === "add_to_cart" && !contextProduct) {
      return { reply: "Please click 'View Details' on a product first so I know what to add to your cart!", products: [] };
  }

  // 🟢 SMART PRODUCT DISCOVERY & AGENTIC AUTO-RECOVERY
  if (intent.intent === "browse" || intent.category || intent.maxPrice || intent.minPrice || intent.style) {
    let products = await findProducts(intent);
    let recoveryMessage = "";
    
    // 🛡️ AGENTIC AUTO-RECOVERY 1: Widen search!
    if (products.length === 0 && intent.category !== "items") {
        let originalCategory = intent.category;
        intent.category = "items"; 
        products = await findProducts(intent);
        if (products.length > 0) {
            recoveryMessage = `I couldn't find any ${originalCategory}s fitting that exact description, but I did find these great alternatives! `;
        }
    }

    // 🛡️ AGENTIC AUTO-RECOVERY 2: Drop the style filter entirely
    if (products.length === 0 && intent.style) {
        let originalStyle = intent.style;
        intent.style = null;
        products = await findProducts(intent);
        if (products.length > 0) {
            recoveryMessage = `I don't have specifically "${originalStyle}" items in that range right now, but here are the best available options! `;
        }
    }

    // Build Dynamic Reply Text
    let desc = [];
    if (intent.style) desc.push(intent.style);
    
    let catText = intent.category || "items";
    if (catText === "tshirt") catText = "t-shirts";
    else if (catText === "shirt") catText = "shirts";
    else if (catText === "blazer") catText = "blazers";
    else if (catText === "jeans") catText = "jeans";
    desc.push(catText);
    
    let priceText = "";
    if (intent.maxPrice && intent.minPrice) priceText = `between ₹${intent.minPrice} and ₹${intent.maxPrice}`;
    else if (intent.maxPrice) priceText = `under ₹${intent.maxPrice}`;
    else if (intent.minPrice) priceText = `above ₹${intent.minPrice}`;

    let naturalDescription = `${desc.join(" ")} ${priceText}`.trim();

    if (products.length === 0) {
        let adjustSuggestion = "Could you try a different style or category?";
        if (intent.maxPrice) adjustSuggestion = "Could you try increasing your budget or changing the style?";
        return { reply: `I couldn't find any matches for ${naturalDescription} right now. ${adjustSuggestion}`, products: [] };
    }

    await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Recommendation Agent', 'FETCH_OPTIONS', $2)", [sessionId, JSON.stringify({ criteria: intent, resultsCount: products.length })]);

    const outOfStock = products.filter(p => p.quantity <= 0);
    let inventoryNote = "";
    if (outOfStock.length > 0 && products.length > 0) {
      await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Inventory Agent', 'STOCK_OUT_RECOVERY', $2)", [sessionId, JSON.stringify({ item: outOfStock[0].name })]);
      inventoryNote = "\n\n*(Note: Some matches were out of stock, so my Inventory Agent fetched available alternatives!)*";
      intent.category = "items"; 
      products = await findProducts(intent); 
    }

    let finalReply = intent.reply || `${recoveryMessage}Absolutely! I've fetched the best ${naturalDescription} for you. Take a look.`;
    if (inventoryNote) finalReply += inventoryNote;
    
    return { reply: finalReply.trim(), products };
  }

  return { reply: intent.reply || "I'm your intelligent shopping assistant. I can help you find products, check stock, or manage your cart. What do you need?", products: [] };
}