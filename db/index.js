import pkg from "pg";
const { Pool } = pkg;

// Use a connection string from environment variables for production
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessary for cloud-hosted databases like Supabase
  }
});