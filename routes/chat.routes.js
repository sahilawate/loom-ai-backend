import { Router } from "express";
import { runAI } from "../services/ai/orchestrator.js";
import { runAdminAI } from "../services/ai/adminOrchestrator.js";
import { pool } from "../db/index.js";

const router = Router();

// GET TIMELINE
router.get("/timeline", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM agent_events ORDER BY created_at DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) { res.json([]); }
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
    } catch(e) { res.status(500).json({error: e.message}); }
});

// GET CHAT HISTORY
router.get("/history", async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.json([]);

  try {
    const result = await pool.query(
      // 🟢 CRITICAL UPDATE: Add 'ORDER_CONFIRMATION' to the allowed actions so the WA receipt shows up!
      `SELECT agent_name, metadata, action, created_at 
       FROM agent_events 
       WHERE session_id = $1 AND (action = 'INITIATES_CONVERSATION' OR action = 'RESPONSE' OR action = 'ORDER_CONFIRMATION')
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
        text: meta?.message || "...",
        action: row.action
      };
    });
    res.json(history);
  } catch (err) { 
    console.error("History DB Error:", err.message);
    res.json([]); 
  }
});

// SEND MESSAGE & EXECUTE AI (USER SIDE)
router.post("/message", async (req, res) => {
  const { sessionId, message, contextProduct, channel = 'mobile' } = req.body;

  if (!sessionId || !message) {
      return res.status(400).json({ reply: "Session ID and message required.", products: [] });
  }

  try {
    await pool.query("INSERT INTO sessions (id, channel) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [sessionId, channel]);
    await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Customer', 'INITIATES_CONVERSATION', $2)", [sessionId, JSON.stringify({ message })]);

    const result = await runAI(sessionId, message, contextProduct);

    await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Sales Agent', 'RESPONSE', $2)", [sessionId, JSON.stringify({ message: result.reply })]);

    res.json({ reply: result.reply, products: result.products || [], action: result.action || null });

  } catch (error) {
    console.error("Chat Route Error:", error.message);
    res.json({ reply: "I'm having a brief connection issue, please try again!", products: [] });
  }
});

// 🟢 NEW: ADMIN AGENT ROUTE (STAFF SIDE)
router.post("/admin", async (req, res) => {
    const { message } = req.body;
    try {
        const response = await runAdminAI(message);
        res.json(response);
    } catch (error) {
        console.error("Admin Chat Error:", error);
        res.status(500).json({ reply: "Internal Operations Error." });
    }
});

export default router;