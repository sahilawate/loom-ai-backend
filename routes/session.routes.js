import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * Create session
 */
router.post("/create", async (req, res) => {
  const { channel } = req.body;

  const result = await pool.query(
    `INSERT INTO sessions(channel)
     VALUES ($1)
     RETURNING *`,
    [channel]
  );

  res.json(result.rows[0]);
});

/**
 * Update stage (for AI flow tracking)
 */
router.post("/stage", async (req, res) => {
  const { sessionId, stage } = req.body;

  await pool.query(
    `UPDATE sessions SET current_stage=$1 WHERE id=$2`,
    [stage, sessionId]
  );

  res.json({ success: true });
});

router.post("/switch-channel", async (req, res) => {
  const { sessionId, channel } = req.body;

  await pool.query(
    "UPDATE sessions SET channel=$1 WHERE id=$2",
    [channel, sessionId]
  );

  res.json({ success: true });
});

export default router;
