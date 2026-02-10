import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * Get all active products with variants & images
 */
router.get("/", async (_, res) => {
  const result = await pool.query(`
    SELECT 
      p.*,
      json_agg(
        json_build_object(
          'id', v.id,
          'size', v.size,
          'color', v.color,
          'price', v.price,
          'sku', v.sku
        )
      ) AS variants,
      (
        SELECT image_url 
        FROM product_images 
        WHERE product_id=p.id AND is_primary=true
        LIMIT 1
      ) AS image
    FROM products p
    JOIN product_variants v ON v.product_id=p.id
    WHERE p.is_active=true
    GROUP BY p.id
  `);

  res.json(result.rows);
});

export default router;
