import { pool } from "../../db/index.js";

export async function findProducts({ category, maxPrice, gender, mission }) {
  try {
    const params = [];
    
    // PROFESSIONAL UPDATE: Fetch sizes array and all Agentic Metadata for the UI
    let query = `
      SELECT
        p.id, p.name, p.category, p.brand, p.keywords, p.specs, p.occasion,
        img.image_url, 
        v.id AS variant_id, v.sizes, v.price, v.discount, 
        i.quantity
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      JOIN inventory i ON i.variant_id = v.id
      LEFT JOIN product_images img ON img.product_id = p.id AND img.is_primary = true
      WHERE p.is_active = true
        AND i.quantity > 0
    `;

    // FUZZY SEARCH & PLURAL LOGIC
    if (category) {
      let searchTerm = category.toLowerCase().trim();
      // Logic to handle plurals: "shirts" -> "shirt"
      if (searchTerm.endsWith('s') && !['dress', 'jeans', 'fabric'].includes(searchTerm)) {
         searchTerm = searchTerm.slice(0, -1);
      }
      
      params.push(`%${searchTerm}%`);
      // Search BOTH Category and Name (Increases accuracy)
      query += ` AND (p.category ILIKE $${params.length} OR p.name ILIKE $${params.length})`; 
    }

    if (maxPrice) {
      params.push(maxPrice);
      query += ` AND v.price <= $${params.length}`;
    }

    // AGENTIC FILTER: Gender Extraction
    if (gender && gender !== 'Unisex') {
      params.push(`%${gender}%`);
      query += ` AND p.gender ILIKE $${params.length}`;
    }

    query += ` ORDER BY RANDOM() LIMIT 12`;

    const { rows } = await pool.query(query, params);
    return rows;

  } catch (error) {
    console.error("Product Resolver Error:", error);
    return []; 
  }
}