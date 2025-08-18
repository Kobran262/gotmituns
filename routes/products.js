const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateProduct, validateUUID, validatePagination } = require('../middleware/validation');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// Get all products with pagination, search, and filtering
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const active_only = req.query.active_only === 'true';

    let whereConditions = [];
    let queryParams = [limit, offset];
    let paramIndex = 3;

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (active_only) {
      whereConditions.push('is_active = true');
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get products with pagination
    const productsResult = await query(
      `SELECT id, code, name, price, weight, category, description, is_active, created_at, updated_at
       FROM products 
       ${whereClause}
       ORDER BY name ASC 
       LIMIT $1 OFFSET $2`,
      queryParams
    );

    // Get total count
    const countParams = queryParams.slice(2); // Remove limit and offset
    const countResult = await query(
      `SELECT COUNT(*) as total FROM products ${whereClause}`,
      countParams
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      products: productsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get all categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT category 
       FROM products 
       WHERE category IS NOT NULL AND category != '' AND is_active = true
       ORDER BY category ASC`
    );

    const categories = result.rows.map(row => row.category);
    res.json({ categories });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get single product by ID
router.get('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, code, name, price, weight, category, description, is_active, created_at, updated_at
       FROM products WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product: result.rows[0] });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create new product
router.post('/', authenticateToken, validateProduct, async (req, res) => {
  try {
    const { code, name, price, weight = 0, category, description } = req.body;

    // Check if product code already exists
    const existingProduct = await query(
      'SELECT id FROM products WHERE code = $1',
      [code]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(400).json({ error: 'Product with this code already exists' });
    }

    const result = await query(
      `INSERT INTO products (code, name, price, weight, category, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, name, price, weight, category, description, is_active, created_at`,
      [code, name, price, weight, category, description, req.user.id]
    );

    const product = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `Created product: ${name} (${code})`, 'product', product.id, req);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Product with this code already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', authenticateToken, validateUUID, validateProduct, async (req, res) => {
  try {
    const { code, name, price, weight, category, description, is_active } = req.body;

    // Check if another product has the same code
    const existingProduct = await query(
      'SELECT id FROM products WHERE code = $1 AND id != $2',
      [code, req.params.id]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(400).json({ error: 'Another product with this code already exists' });
    }

    const result = await query(
      `UPDATE products 
       SET code = $1, name = $2, price = $3, weight = COALESCE($4, weight), category = $5, description = $6, is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING id, code, name, price, weight, category, description, is_active, updated_at`,
      [code, name, price, weight, category, description, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `Updated product: ${name} (${code})`, 'product', product.id, req);

    res.json({
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Product with this code already exists' });
    }
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Soft delete product (set is_active to false)
router.delete('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    // Check if product is used in any invoices or deliveries
    const dependenciesResult = await query(
      `SELECT 
        (SELECT COUNT(*) FROM invoice_items WHERE product_id = $1) as invoice_usage,
        (SELECT COUNT(*) FROM delivery_items WHERE product_id = $1) as delivery_usage`,
      [req.params.id]
    );

    const { invoice_usage, delivery_usage } = dependenciesResult.rows[0];

    if (parseInt(invoice_usage) > 0 || parseInt(delivery_usage) > 0) {
      // If product is used, just deactivate it instead of deleting
      const result = await query(
        `UPDATE products SET is_active = false 
         WHERE id = $1 
         RETURNING id, code, name`,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const product = result.rows[0];

      // Log activity
      await logActivity(req.user.id, `Deactivated product: ${product.name} (${product.code})`, 'product', product.id, req);

      return res.json({ 
        message: 'Product deactivated (cannot delete due to existing usage)',
        product: { ...product, is_active: false }
      });
    }

    // Get product info for logging
    const productResult = await query(
      'SELECT code, name FROM products WHERE id = $1', 
      [req.params.id]
    );
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const { code, name } = productResult.rows[0];

    // Delete product completely
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Log activity
    await logActivity(req.user.id, `Deleted product: ${name} (${code})`, 'product', req.params.id, req);

    res.json({ message: 'Product deleted successfully' });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Reactivate product
router.patch('/:id/activate', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `UPDATE products SET is_active = true 
       WHERE id = $1 
       RETURNING id, code, name, is_active`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `Reactivated product: ${product.name} (${product.code})`, 'product', product.id, req);

    res.json({
      message: 'Product reactivated successfully',
      product
    });

  } catch (error) {
    console.error('Activate product error:', error);
    res.status(500).json({ error: 'Failed to reactivate product' });
  }
});

// Get product usage statistics
router.get('/:id/stats', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        p.id, p.code, p.name,
        COUNT(DISTINCT ii.invoice_id) as invoice_count,
        COUNT(DISTINCT di.delivery_id) as delivery_count,
        COALESCE(SUM(ii.quantity), 0) as total_sold_quantity,
        COALESCE(SUM(ii.total_price), 0) as total_revenue
       FROM products p
       LEFT JOIN invoice_items ii ON p.id = ii.product_id
       LEFT JOIN delivery_items di ON p.id = di.product_id
       WHERE p.id = $1
       GROUP BY p.id, p.code, p.name`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ stats: result.rows[0] });

  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ error: 'Failed to fetch product statistics' });
  }
});

module.exports = router;

