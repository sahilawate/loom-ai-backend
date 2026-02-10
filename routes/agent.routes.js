import { Router } from "express";
import { pool } from "../db/index.js";

const router = Router();

// Helper to check if string is UUID
const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

router.get("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  // 🛠️ FIX: Prevent crash if sessionId is "events" or invalid
  if (!sessionId || !isUUID(sessionId)) {
    return res.json([]); // Return empty if not a valid UUID
  }

  try {
    const result = await pool.query(
      `SELECT * FROM agent_events 
       WHERE session_id = $1 
       AND action IN ('MESSAGE', 'ORDER_CONFIRMATION', 'ORDER_PLACED', 'ADD_TO_CART')
       ORDER BY created_at DESC`,
      [sessionId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Agent Timeline Error:", err.message);
    res.status(500).json([]);
  }
});

export default router;