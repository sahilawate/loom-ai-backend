import { pool } from "../../db/index.js";

export async function filterAvailableVariants(category) {
  const result = await pool.query(
    `
    SELECT v.*
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN inventory i ON i.variant_id = v.id
    WHERE p.category = $1
      AND i.quantity > 0
    `,
    [category]
  );

  return result.rows;
}
