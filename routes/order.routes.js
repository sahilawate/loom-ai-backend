import { Router } from "express";
import { pool } from "../db/index.js";

const router = Router();

// DB AUTO-PATCHER: Fixes the "orders_status_check" constraint error automatically!
(async function patchDatabase() {
    try {
        console.log("🛠️ Checking database constraints...");
        await pool.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;`);
        await pool.query(`
            ALTER TABLE orders ADD CONSTRAINT orders_status_check 
            CHECK (status IN ('pending', 'processing', 'packed', 'shipped', 'delivered', 'completed', 'cancelled'));
        `);
        console.log("✅ Database constraints patched successfully for Agentic Fulfillment.");
    } catch (e) {
        console.warn("⚠️ Note: Could not auto-patch DB constraints (might already be fixed):", e.message);
    }
})();

// 1. PLACE ORDER (Deducts Stock)
router.post("/", async (req, res) => {
  const { sessionId, waSessionId, totalAmount } = req.body;

  try {
    await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Payment Agent', 'PROCESS_PAYMENT', $2)",
        [sessionId, JSON.stringify({ message: `Processing payment of ₹${totalAmount}...` })]
    );

    const cart = await pool.query("SELECT * FROM cart_items WHERE session_id = $1", [sessionId]);
    if (cart.rows.length === 0) return res.status(400).json({ error: "Empty cart" });

    const orderRes = await pool.query(
      "INSERT INTO orders (session_id, total_amount, status) VALUES ($1, $2, 'processing') RETURNING id",
      [sessionId, totalAmount]
    );
    const orderId = orderRes.rows[0].id;

    let receiptText = ""; 
    for (const item of cart.rows) {
      const v = await pool.query(
        `SELECT v.price, p.name FROM product_variants v JOIN products p ON v.product_id = p.id WHERE v.id = $1`, 
        [item.variant_id]
      );
      const price = v.rows[0]?.price || 0;
      const name = v.rows[0]?.name || "Item";

      await pool.query(
        "UPDATE inventory SET quantity = quantity - $1 WHERE variant_id = $2",
        [item.quantity, item.variant_id]
      );

      await pool.query(
        "INSERT INTO order_items (order_id, variant_id, quantity, price) VALUES ($1, $2, $3, $4)", 
        [orderId, item.variant_id, item.quantity, price]
      );
      
      const sizeDisplay = item.size !== 'Universal' ? ` (Size: ${item.size})` : '';
      receiptText += `• ${name}${sizeDisplay} (x${item.quantity}) - ₹${price * item.quantity}\n`;
    }

    const waMarker = `[WA_ORDER_${Date.now()}]`;
    
    // 🟢 UPDATED MESSAGE: Added the conversational follow-up at the end!
    const waMessage = `${waMarker} ✅ *Order Placed Successfully!* 🎉\n\n🆔 *Order ID:* #${orderId.slice(0,8)}\n\n🛒 *Items:*\n${receiptText}\n💰 *Total :* ₹${totalAmount}\n\n[TRACK_ORDER_BTN]\n\nWould you like me to find similar items or help you continue shopping?`;

    await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Fulfillment Agent', 'ORDER_RECEIVED', $2)",
        [sessionId, JSON.stringify({ message: `Order #${orderId.slice(0,8)} sent to warehouse.` })]
    );

    if (waSessionId) {
      await pool.query("INSERT INTO sessions (id, channel) VALUES ($1, 'whatsapp') ON CONFLICT (id) DO NOTHING", [waSessionId]);
      await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Post-Purchase Support Agent', 'ORDER_CONFIRMATION', $2)", 
        [waSessionId, JSON.stringify({ message: waMessage, orderId })]
      );
    }

    await pool.query("DELETE FROM cart_items WHERE session_id = $1", [sessionId]);
    res.json({ success: true, orderId });

  } catch (err) {
    console.error("Critical Order Error:", err.message);
    res.status(500).json({ error: "Order failed" });
  }
});

// 2. UPDATE ORDER STATUS
router.post("/update", async (req, res) => {
    const { orderId, status } = req.body;
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        
        const orderInfo = await pool.query('SELECT session_id FROM orders WHERE id = $1', [orderId]);
        const orderSessionId = orderInfo.rows[0]?.session_id;

        if (orderSessionId) {
            await pool.query(
                "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Operations Agent', 'STATUS_UPDATED', $2)", 
                [orderSessionId, JSON.stringify({ orderId, status, message: `Your order was updated to ${status}.` })]
            );
        }

        res.json({ success: true, message: `Order marked as ${status}` });
    } catch (e) {
        console.error("Update Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. CANCEL ORDER
router.post("/cancel", async (req, res) => {
  const { orderId, sessionId } = req.body;
  try {
    const items = await pool.query("SELECT variant_id, quantity FROM order_items WHERE order_id = $1", [orderId]);
    
    for (const item of items.rows) {
        await pool.query(
            "UPDATE inventory SET quantity = quantity + $1 WHERE variant_id = $2", 
            [item.quantity, item.variant_id]
        );
    }

    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
    
    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Customer', 'ORDER_CANCELLED', $2)", 
      [sessionId, JSON.stringify({ message: `❌ Order #${orderId.slice(0,8)} was cancelled!` })]
    );
    res.json({ success: true });
  } catch (err) { 
    console.error("Cancel Error:", err);
    res.status(500).json({ error: "Cancel failed" }); 
  }
});

// 4. GET ORDERS
router.get("/all", async (req, res) => {
  try {
    const { sessionId } = req.query;
    let query = `
      SELECT o.*, json_agg(json_build_object('name', COALESCE(p.name, 'Item'), 'qty', oi.quantity, 'size', ci.size, 'image', (SELECT image_url FROM product_images WHERE product_id = p.id LIMIT 1))) as items 
      FROM orders o 
      LEFT JOIN order_items oi ON o.id = oi.order_id 
      LEFT JOIN cart_items ci ON ci.variant_id = oi.variant_id
      LEFT JOIN product_variants v ON oi.variant_id = v.id 
      LEFT JOIN products p ON v.product_id = p.id 
    `;
    if (sessionId) {
      query += ` WHERE o.session_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`;
      const result = await pool.query(query, [sessionId]);
      return res.json(result.rows);
    }
    query += ` GROUP BY o.id ORDER BY o.created_at DESC`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) { res.json([]); }
});

export default router;