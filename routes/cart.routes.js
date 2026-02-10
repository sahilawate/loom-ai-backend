import { Router } from "express";
import { pool } from "../db/index.js";

const router = Router();

// 1. GET CART
router.get("/", async (req, res) => {
  const { sessionId } = req.query;
  try {
    const result = await pool.query(
      `SELECT ci.*, 
              COALESCE(v.price, 0) as price, 
              COALESCE(p.name, 'Item #' || ci.variant_id) as name,
              p.image_url
       FROM cart_items ci
       LEFT JOIN product_variants v ON ci.variant_id = v.id
       LEFT JOIN products p ON v.product_id = p.id
       WHERE ci.session_id = $1`,
      [sessionId]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error("Cart Fetch Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. ADD TO CART
router.post("/add", async (req, res) => {
  const { sessionId, variantId, quantity = 1 } = req.body;
  try {
    await pool.query(
      "INSERT INTO sessions (id, channel) VALUES ($1, 'mobile') ON CONFLICT (id) DO NOTHING",
      [sessionId]
    );
    const check = await pool.query(
      "SELECT * FROM cart_items WHERE session_id = $1 AND variant_id = $2",
      [sessionId, variantId]
    );
    if (check.rows.length > 0) {
      await pool.query(
        "UPDATE cart_items SET quantity = quantity + $1 WHERE session_id = $2 AND variant_id = $3",
        [quantity, sessionId, variantId]
      );
    } else {
      await pool.query(
        "INSERT INTO cart_items (session_id, variant_id, quantity) VALUES ($1, $2, $3)",
        [sessionId, variantId, quantity]
      );
    }
    
    // 🟢 Agent Timeline Log: Inventory Agent
    try {
        await pool.query(
            "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Inventory Agent', 'CHECK_STOCK', $2)",
            [sessionId, JSON.stringify({ message: `Stock confirmed for Item #${variantId}` })]
        );
    } catch(e) {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add to cart" });
  }
});

// 3. REMOVE SPECIFIC ITEM
router.post("/remove", async (req, res) => {
  const { sessionId, variantId } = req.body;
  try {
    if (!sessionId || !variantId) {
      return res.status(400).json({ error: "Missing sessionId or variantId" });
    }

    await pool.query(
      "DELETE FROM cart_items WHERE session_id = $1 AND variant_id = $2", 
      [sessionId, variantId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Remove Error:", err.message);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

// 4. CLEAR CART
router.delete("/clear", async (req, res) => {
  const { sessionId } = req.query;
  try {
    await pool.query("DELETE FROM cart_items WHERE session_id = $1", [sessionId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear cart" });
  }
});

export default router;