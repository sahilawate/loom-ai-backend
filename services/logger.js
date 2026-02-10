import { pool } from "../db/index.js";

export async function logAgent(sessionId, agent, action, metadata = {}) {
  await pool.query(
    `INSERT INTO agent_events(session_id, agent_name, action, metadata)
     VALUES ($1,$2,$3,$4)`,
    [sessionId, agent, action, metadata]
  );
}
