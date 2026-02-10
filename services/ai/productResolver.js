import { pool } from "../../db/index.js";

export async function findProducts({ category, maxPrice }) {
  try {
    const params = [];
    
    // 🟢 CORRECTED QUERY: Join with product_images table to get the URL
    let query = `
      SELECT
        p.id,
        p.name,
        p.category,
        img.image_url, 
        v.id AS variant_id,
        v.size,
        v.price
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      JOIN inventory i ON i.variant_id = v.id
      LEFT JOIN product_images img ON img.product_id = p.id AND img.is_primary = true
      WHERE p.is_active = true
        AND i.quantity > 0
    `;

    // Only add category filter if it exists
    if (category) {
      params.push(category);
      query += ` AND p.category ILIKE $${params.length}`; 
    }

    // Only add price filter if it exists
    if (maxPrice) {
      params.push(maxPrice);
      query += ` AND v.price <= $${params.length}`;
    }

    query += `
      ORDER BY v.price ASC
      LIMIT 8
    `;

    const { rows } = await pool.query(query, params);
    return rows;

  } catch (error) {
    // This logs the specific database error to your Render dashboard
    console.error("Product Resolver Error:", error);
    return []; 
  }
}