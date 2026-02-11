import { Router } from "express";
import { pool } from "../db/index.js";

const router = Router();

// 1. PLACE ORDER (Deducts Stock)
router.post("/", async (req, res) => {
  const { sessionId, totalAmount } = req.body;

  try {
    // A. Log Payment Agent
    await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Payment Agent', 'PROCESS_PAYMENT', $2)",
        [sessionId, JSON.stringify({ message: `Processing payment of ₹${totalAmount}...` })]
    );

    // B. Validate Cart
    const cart = await pool.query("SELECT * FROM cart_items WHERE session_id = $1", [sessionId]);
    if (cart.rows.length === 0) return res.status(400).json({ error: "Empty cart" });

    // C. Create Order Record
    const orderRes = await pool.query(
      "INSERT INTO orders (session_id, total_amount, status) VALUES ($1, $2, 'pending') RETURNING id",
      [sessionId, totalAmount]
    );
    const orderId = orderRes.rows[0].id;

    // D. Build Receipt & Deduct Inventory
    let receiptText = ""; 
    for (const item of cart.rows) {
      const v = await pool.query(
        `SELECT v.price, p.name FROM product_variants v JOIN products p ON v.product_id = p.id WHERE v.id = $1`, 
        [item.variant_id]
      );
      const price = v.rows[0]?.price || 0;
      const name = v.rows[0]?.name || "Item";

      // CRITICAL: Subtract Quantity from Inventory
      await pool.query(
        "UPDATE inventory SET quantity = quantity - $1 WHERE variant_id = $2",
        [item.quantity, item.variant_id]
      );

      await pool.query(
        "INSERT INTO order_items (order_id, variant_id, quantity, price) VALUES ($1, $2, $3, $4)", 
        [orderId, item.variant_id, item.quantity, price]
      );
      receiptText += `• ${name} (x${item.quantity}) - ₹${price * item.quantity}\n`;
    }

    // E. Generate Unique Marker
    const waMarker = `[WA_ORDER_${Date.now()}]`;
    const waMessage = `${waMarker} ✅ *Order Placed Successfully!* 🎉\n\n🆔 *Order ID:* #${orderId.slice(0,8)}\n\n🛒 *Items:*\n${receiptText}\n💰 *Total Paid:* ₹${totalAmount}\n\nWould you like to see similar items?`;

    // F. Log Fulfillment Agent
    await pool.query(
        "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Fulfillment Agent', 'ORDER_PACKED', $2)",
        [sessionId, JSON.stringify({ message: `Order #${orderId.slice(0,8)} sent to warehouse.` })]
    );

    // G. Log Post-Purchase Support Agent
    await pool.query(
      "INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Post-Purchase Support Agent', 'ORDER_CONFIRMATION', $2)", 
      [sessionId, JSON.stringify({ message: waMessage, orderId })]
    );

    // H. Clear Cart
    await pool.query("DELETE FROM cart_items WHERE session_id = $1", [sessionId]);
    res.json({ success: true, orderId });

  } catch (err) {
    console.error("Critical Order Error:", err.message);
    res.status(500).json({ error: "Order failed" });
  }
});

// 2. CANCEL ORDER (Restocks Inventory)
router.post("/cancel", async (req, res) => {
  const { orderId, sessionId } = req.body;
  try {
    // 1. Find items to restock
    const items = await pool.query("SELECT variant_id, quantity FROM order_items WHERE order_id = $1", [orderId]);
    
    // 2. Loop through and ADD stock back
    for (const item of items.rows) {
        await pool.query(
            "UPDATE inventory SET quantity = quantity + $1 WHERE variant_id = $2", 
            [item.quantity, item.variant_id]
        );
    }

    // 3. Mark order as cancelled
    await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
    
    // 4. Log Event
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

// 3. GET ORDERS
router.get("/all", async (req, res) => {
  try {
    const { sessionId } = req.query;
    let query = `
      SELECT o.*, json_agg(json_build_object('name', COALESCE(p.name, 'Item'), 'qty', oi.quantity)) as items 
      FROM orders o 
      LEFT JOIN order_items oi ON o.id = oi.order_id 
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