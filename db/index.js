import pkg from "pg";
const { Pool } = pkg;

// Use the DATABASE_URL environment variable from Render
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for secure cloud database connections
  }
});