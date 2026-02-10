import { pool } from "../../db/index.js";

export async function suggestSimilar(category) {
  if (!category) return [];

  const result = await pool.query(
    `
    SELECT p.id, p.name, p.category
    FROM products p
    WHERE p.category != $1
    LIMIT 3
    `,
    [category]
  );

  return result.rows;
}
