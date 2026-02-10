import { Router } from "express";
import { parseIntent } from "../services/ai/intentParser.js";
import { findProducts } from "../services/ai/productResolver.js";
import { pool } from "../db/index.js";

const router = Router();

// 🟢 GET TIMELINE
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

// 🟢 MANUAL LOGGER
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

// 🟢 1. GET CHAT HISTORY
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
        action: row.action // Passed to frontend for specific filtering
      };
    });
    res.json(history);
  } catch (err) { res.json([]); }
});

// 🟢 2. SEND MESSAGE
router.post("/message", async (req, res) => {
  const { sessionId, message } = req.body;

  try {
    // Session Check
    await pool.query(
      "INSERT INTO sessions (id, channel) VALUES ($1, 'mobile') ON CONFLICT (id) DO NOTHING",
      [sessionId]
    );

    // Log Customer Action
    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Customer', 'INITIATES_CONVERSATION', $2)",
      [sessionId, JSON.stringify({ message })]
    );

    // AI Logic
    const intent = await parseIntent(message);
    let products = [];
    let reply = "";
    let activeAgent = "AI Conversational Sales Agent";

    if (intent.intent === "buy") {
      reply = "Great! Click 'Buy Now' on the item you like.";
    } else if (intent.intent === "browse" || intent.category) {
      activeAgent = "Recommendation Agent";
      products = await findProducts(intent);
      const cat = intent.category || "items";
      if (products.length > 0) {
        reply = intent.maxPrice 
          ? `I found ${cat} under ₹${intent.maxPrice}.` 
          : `Here are some ${cat} I found.`;
      } else {
        reply = `I couldn't find any ${cat}. Try adjusting your budget?`;
      }
    } else {
      reply = "I can help you find shirts, jeans, and dresses.";
    }

    // Log AI/Agent Response
    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, $2, 'RESPONSE', $3)",
      [sessionId, activeAgent, JSON.stringify({ message: reply })]
    );

    res.json({ reply, products });

  } catch (error) {
    console.error("Chat Route Critical Failure:", error);
    res.json({ reply: "I'm having trouble connecting.", products: [] });
  }
});

export default router;