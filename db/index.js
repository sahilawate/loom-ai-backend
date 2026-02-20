import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const isProduction = process.env.DATABASE_URL.includes('supabase.co') || process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});