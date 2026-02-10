// backend/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";

// Import Routes
import sessionRoutes from "./routes/session.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import agentRoutes from "./routes/agent.routes.js";

const app = express();

// 🟢 FIX 1: Use the Port provided by Render
const PORT = process.env.PORT || 4000;

// 🟢 FIX 2: Use the Frontend URL from Render Environment Variables
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:3000", 
  credentials: true 
}));

app.use(express.json());

// Routes
app.use("/api/session", sessionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/agents", agentRoutes);

// Health Check
app.get("/", (req, res) => res.send("Backend is running!"));

// 🟢 FIX 3: Listen on 0.0.0.0 for Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});