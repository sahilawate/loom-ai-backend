import "dotenv/config";
import express from "express";
import cors from "cors";
// ... imports ...

const app = express();
// Use dynamic port for Render
const PORT = process.env.PORT || 4000;

// Allow your future Vercel URL
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:3000", 
  credentials: true 
}));

app.use(express.json());
// ... routes ...

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});