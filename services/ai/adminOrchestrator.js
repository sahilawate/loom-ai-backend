import fetch from "node-fetch";
import "dotenv/config";
import { pool } from "../../db/index.js";

export async function runAdminAI(message) {
  const SYSTEM_PROMPT = `
You are the Store Operations Manager AI. 
Your job is to read staff commands and extract instructions to update order statuses or fetch reports.

RULES:
1. If the staff asks to update an order, extract the "order_id" (usually a short alphanumeric string) and the "new_status" (e.g., packed, shipped, cancelled, delivered).
2. Set intent to "update_order".

Output ONLY strictly valid JSON:
{
  "intent": "update_order" | "report" | "unknown",
  "reply": "Conversational confirmation message.",
  "order_id": "extracted string or null",
  "new_status": "packed" | "shipped" | "cancelled" | "delivered" | null
}
  `;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + `\nStaff Input: "${message}"` }] }] })
    });
    
    const data = await res.json();
    let textResponse = data.candidates[0].content.parts[0].text.replace(/```json/g, "").replace(/```/g, "").trim();
    let intent = JSON.parse(textResponse);

    // 🟢 EXECUTE THE STAFF COMMAND ON THE DATABASE
    if (intent.intent === "update_order" && intent.order_id && intent.new_status) {
        // Find the order using a LIKE query since staff might only type the first few characters (e.g., "3fa8")
        const orderRes = await pool.query("SELECT id FROM orders WHERE id::text ILIKE $1 LIMIT 1", [`${intent.order_id}%`]);
        
        if (orderRes.rows.length > 0) {
            const fullOrderId = orderRes.rows[0].id;
            await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [intent.new_status, fullOrderId]);
            
            // Log Agent Action
            await pool.query("INSERT INTO agent_events (session_id, agent_name, action, metadata) VALUES ($1, 'Operations Agent', 'STATUS_UPDATED', $2)", ['admin_panel', JSON.stringify({ orderId: fullOrderId, status: intent.new_status })]);

            return { reply: `Got it! I have autonomously updated order ${fullOrderId.slice(0,8).toUpperCase()} to **${intent.new_status.toUpperCase()}**.`, action: "REFRESH_ORDERS" };
        } else {
            return { reply: `I couldn't find an order matching "${intent.order_id}". Can you double-check the ID in the feed?` };
        }
    }

    return { reply: intent.reply || "I'm your Operations Copilot. Tell me which order to update!" };

  } catch (error) {
    return { reply: "My connection to the database is currently interrupted." };
  }
}