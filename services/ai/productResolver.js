import { pool } from "../../db/index.js";

export async function findProducts({ category, maxPrice }) {
  try {
    const params = [];
    
    // 🟢 REFINED QUERY: We select p.image_url directly from products table
    // We removed the SELECT image_url FROM product_images subquery as that table doesn't exist
    let query = `
      SELECT
        p.id,
        p.name,
        p.category,
        p.image_url, 
        v.id AS variant_id,
        v.size,
        v.price
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      JOIN inventory i ON i.variant_id = v.id
      WHERE p.is_active = true
        AND i.quantity > 0
    `;

    // DYNAMIC QUERY: Only add category filter if it exists
    if (category) {
      params.push(category);
      // ILIKE makes it case-insensitive (Shirt == shirt)
      query += ` AND p.category ILIKE $${params.length}`; 
    }

    // PRICE FILTER
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
    console.error("Product Resolver Error:", error);
    return []; // Return empty list instead of crashing the server
  }
}