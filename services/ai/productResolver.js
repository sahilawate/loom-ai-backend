import { pool } from "../../db/index.js";

export async function findProducts(intent) {
  try {
    const params = [];
    
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

    // 1. CATEGORY & FUZZY SEARCH
    if (intent.category && intent.category !== "items") {
      let searchTerm = intent.category.toLowerCase().trim();
      if (searchTerm.endsWith('s') && !['dress', 'jeans', 'fabric'].includes(searchTerm)) {
         searchTerm = searchTerm.slice(0, -1);
      }
      
      if (searchTerm === 'shirt') {
          query += ` AND (p.category ILIKE $${params.length + 1} OR p.name ILIKE $${params.length + 1}) AND p.category NOT ILIKE '%t-shirt%' AND p.category NOT ILIKE '%tshirt%'`;
          params.push(`%shirt%`);
      } else if (searchTerm === 'tshirt' || searchTerm === 't-shirt') {
          query += ` AND (p.category ILIKE '%t-shirt%' OR p.category ILIKE '%tshirt%')`;
      } else {
          query += ` AND (p.category ILIKE $${params.length + 1} OR p.name ILIKE $${params.length + 1})`;
          params.push(`%${searchTerm}%`);
      }
    }

    // 2. CONTEXTUAL LOGIC (Smart Style Filtering)
    if (intent.style) {
      params.push(`%${intent.style}%`);
      
      // Prevent Blazers from appearing in "Beach" or pure "Casual" searches unless explicitly asked for.
      if (intent.style === 'beach' || intent.style === 'summer') {
          query += ` AND (p.occasion ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.keywords ILIKE $${params.length}) AND p.category NOT ILIKE '%blazer%'`;
      } 
      // Prioritize formal shirts, trousers, and blazers for "formal wear", excluding jeans and t-shirts.
      else if (intent.style === 'formal' || intent.style === 'wedding' || intent.style === 'professional') {
           query += ` AND (p.occasion ILIKE $${params.length} OR p.keywords ILIKE $${params.length} OR p.category ILIKE '%shirt%' OR p.category ILIKE '%blazer%') AND p.category NOT ILIKE '%t-shirt%' AND p.category NOT ILIKE '%jeans%'`;
      } 
      else {
          query += ` AND (p.occasion ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.keywords ILIKE $${params.length} OR p.category ILIKE $${params.length})`;
      }
    }

    // 3. PRICE CONSTRAINTS
    if (intent.maxPrice) {
      params.push(intent.maxPrice);
      query += ` AND v.price <= $${params.length}`;
    }
    if (intent.minPrice) {
      params.push(intent.minPrice);
      query += ` AND v.price >= $${params.length}`;
    }

    query += ` ORDER BY RANDOM() LIMIT 12`;

    const { rows } = await pool.query(query, params);
    
    return rows.map(r => {
        if (typeof r.sizes === 'string') {
            try { r.sizes = JSON.parse(r.sizes); } catch(e) { r.sizes = r.sizes.split(',').map(s=>s.trim()); }
        }
        if (!r.sizes || r.sizes.length === 0) r.sizes = ["Universal"];
        return r;
    });

  } catch (error) {
    console.error("Product Resolver Error:", error);
    return []; 
  }
}