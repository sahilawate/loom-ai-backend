import { Router } from "express";
import { parseIntent } from "../services/ai/intentParser.js";
import { findProducts } from "../services/ai/productResolver.js";
import { pool } from "../db/index.js";

const router = Router();

// GET TIMELINE
router.get("/timeline", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM agent_events ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

// MANUAL LOGGER
router.post("/log", async (req, res) => {
    const { sessionId, agentName, action, message } = req.body;
    try {
        await pool.query(
            "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, $2, $3, $4)",
            [sessionId, agentName, action, JSON.stringify({ message })]
        );
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({error: e.message}); 
    }
});

// GET CHAT HISTORY
router.get("/history", async (req, res) => {
  const { sessionId } = req.query;
  try {
    const result = await pool.query(
      `SELECT agent_name, metadata, action, created_at 
       FROM agent_events 
       WHERE session_id = $1 
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const history = result.rows.map(row => {
      let meta = row.metadata;
      if (typeof meta === "string") {
        try { meta = JSON.parse(meta); } catch (e) { meta = { message: "" }; }
      }
      return {
        role: (row.agent_name === "Customer" || row.agent_name === "User") ? "user" : "ai",
        text: meta.message || "...",
        action: row.action
      };
    });
    res.json(history);
  } catch (err) { res.json([]); }
});

// SEND MESSAGE & AI ROUTING
router.post("/message", async (req, res) => {
  // 🟢 NEW: Destructure contextProduct sent from the frontend side-panel
  const { sessionId, message, contextProduct } = req.body;

  try {
    await pool.query(
      "INSERT INTO sessions (id, channel) VALUES ($1, 'mobile') ON CONFLICT (id) DO NOTHING",
      [sessionId]
    );

    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Customer', 'INITIATES_CONVERSATION', $2)",
      [sessionId, JSON.stringify({ message })]
    );

    // 1. Pass the active product context to the AI Brain
    const intent = await parseIntent(message, contextProduct);
    let products = [];
    let reply = "";
    
    // 🟢 FLOWCHART LOGIC: AI Conversational Sales Agent routes the request
    let activeAgent = "AI Conversational Sales Agent";
    let action = null;

    // 🟢 AGENTIC COMMAND: Add to Cart via Chat
    if (intent.intent === "add_to_cart" && contextProduct) {
      activeAgent = "Inventory Agent"; // Flowchart alignment
      reply = intent.reply || `Adding size ${intent.size || 'default'} to your cart!`;
      action = { 
        type: "ADD_TO_CART", 
        size: intent.size, 
        quantity: intent.quantity || 1, 
        variantId: contextProduct.variant_id 
      };
    } 
    // 🟢 CONTEXTUAL COMMAND: Product Knowledge/Specs Question
    else if (intent.intent === "product_question" && contextProduct) {
      activeAgent = "Recommendation Agent"; // Flowchart alignment
      reply = intent.reply || "It looks like a great product!";
    }
    // 🟢 STANDARD BROWSING
    else if (intent.intent === "browse" || intent.category) {
      activeAgent = "Recommendation Agent"; // Flowchart alignment
      products = await findProducts(intent);
      const cat = intent.category || "items";
      
      if (products.length > 0) {
        reply = intent.mission 
          ? `I've found some excellent ${cat} perfect for your ${intent.mission}!` 
          : `Here are the best ${cat} I found for you.`;
      } else {
        reply = `I couldn't find any exact matches for ${cat}. Try adjusting your search?`;
      }
    } 
    else if (intent.intent === "greeting") {
      reply = "Hi 👋 I’m Loom AI. Tell me what you’re looking for — for example, 'office shirts under 2000'.";
    } 
    else {
      reply = "I didn't quite catch that. I can help you find products, answer questions about them, or add them to your cart.";
    }

    // 3. Log AI Response with the Correct Flowchart Agent
    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, $2, 'RESPONSE', $3)",
      [sessionId, activeAgent, JSON.stringify({ message: reply })]
    );

    // 🟢 NEW: Return the actionable command to the frontend
    res.json({ reply, products, action });

  } catch (error) {
    console.error("Chat Route Critical Failure:", error);
    res.json({ reply: "I'm having trouble connecting.", products: [] });
  }
});

export default router;