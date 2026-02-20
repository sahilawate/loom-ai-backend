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
              img.image_url
       FROM cart_items ci
       LEFT JOIN product_variants v ON ci.variant_id = v.id
       LEFT JOIN products p ON v.product_id = p.id
       LEFT JOIN product_images img ON img.product_id = p.id AND img.is_primary = true
       WHERE ci.session_id = $1`,
      [sessionId]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error("Cart Fetch Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. SMART ADD TO CART (With Flowchart Inventory Agent Logic)
router.post("/add", async (req, res) => {
  const { sessionId, variantId, quantity = 1, size = 'Universal' } = req.body;
  
  try {
    await pool.query("INSERT INTO sessions (id, channel) VALUES ($1, 'mobile') ON CONFLICT (id) DO NOTHING", [sessionId]);

    // 🟢 FLOWCHART ALIGNMENT: Inventory Agent checks stock
    await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Inventory Agent', 'CHECK_STOCK', $2)",
        [sessionId, JSON.stringify({ message: `Checking stock availability for Item #${variantId}...` })]
    );

    // A. Check Total Available Inventory in DB
    const invRes = await pool.query("SELECT quantity FROM inventory WHERE variant_id = $1", [variantId]);
    const availableStock = invRes.rows[0]?.quantity || 0;

    // B. Check How Many Are Already In The Cart
    const cartRes = await pool.query("SELECT SUM(quantity) as total_cart_qty FROM cart_items WHERE session_id = $1 AND variant_id = $2", [sessionId, variantId]);
    const currentCartQty = parseInt(cartRes.rows[0]?.total_cart_qty || 0);

    // C. Validation: Prevent exceeding stock
    if (currentCartQty + quantity > availableStock) {
        return res.json({ 
            success: false, 
            error: "STOCK_LIMIT",
            message: `Only ${availableStock} left in stock. You already have ${currentCartQty} in your cart.` 
        });
    }

    // D. Insert or Update Cart
    const check = await pool.query("SELECT * FROM cart_items WHERE session_id = $1 AND variant_id = $2", [sessionId, variantId]);
    
    if (check.rows.length > 0) {
      await pool.query("UPDATE cart_items SET quantity = quantity + $1 WHERE id = $2", [quantity, check.rows[0].id]);
    } else {
      await pool.query("INSERT INTO cart_items (session_id, variant_id, quantity) VALUES ($1, $2, $3)", [sessionId, variantId, quantity]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Cart Add Error:", err.message);
    res.status(500).json({ success: false, error: "Failed to add to cart" });
  }
});

// 3. REMOVE SPECIFIC ITEM
router.post("/remove", async (req, res) => {
  const { sessionId, variantId } = req.body;
  try {
    await pool.query("DELETE FROM cart_items WHERE session_id = $1 AND variant_id = $2", [sessionId, variantId]);
    res.json({ success: true });
  } catch (err) {
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