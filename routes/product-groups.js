const express = require('express');
const { Pool } = require('pg');
const { body, validationResult, param } = require('express-validator');
const auth = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all product groups
router.get('/', auth, async (req, res) => {
  try {
    const query = `
      SELECT 
        pg.id,
        pg.name,
        pg.quantity_type,
        pg.original_quantity,
        pg.current_quantity,
        pg.shipment_date,
        pg.reservation_type,
        pg.reservation_amount,
        pg.created_at,
        pg.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', p.id,
              'code', p.code,
              'name', p.name,
              'weight', p.weight,
              'price', p.price
            )
          ) FILTER (WHERE p.id IS NOT NULL), 
          '[]'
        ) as products
      FROM product_groups pg
      LEFT JOIN product_group_items pgi ON pg.id = pgi.group_id
      LEFT JOIN products p ON pgi.product_id = p.id
      GROUP BY pg.id, pg.name, pg.quantity_type, pg.original_quantity, 
               pg.current_quantity, pg.shipment_date, pg.reservation_type, 
               pg.reservation_amount, pg.created_at, pg.updated_at
      ORDER BY pg.created_at DESC
    `;
    
    const result = await pool.query(query);
    
    await logActivity(req.user.id, 'VIEW_PRODUCT_GROUPS', 'product_groups', null, {
      count: result.rows.length
    });
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching product groups:', error);
    res.status(500).json({ error: 'Failed to fetch product groups' });
  }
});

// Get single product group
router.get('/:id', auth, [
  param('id').isUUID().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    
    const query = `
      SELECT 
        pg.id,
        pg.name,
        pg.quantity_type,
        pg.original_quantity,
        pg.current_quantity,
        pg.shipment_date,
        pg.reservation_type,
        pg.reservation_amount,
        pg.created_at,
        pg.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', p.id,
              'code', p.code,
              'name', p.name,
              'weight', p.weight,
              'price', p.price
            )
          ) FILTER (WHERE p.id IS NOT NULL), 
          '[]'
        ) as products
      FROM product_groups pg
      LEFT JOIN product_group_items pgi ON pg.id = pgi.group_id
      LEFT JOIN products p ON pgi.product_id = p.id
      WHERE pg.id = $1
      GROUP BY pg.id, pg.name, pg.quantity_type, pg.original_quantity, 
               pg.current_quantity, pg.shipment_date, pg.reservation_type, 
               pg.reservation_amount, pg.created_at, pg.updated_at
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product group not found' });
    }
    
    await logActivity(req.user.id, 'VIEW_PRODUCT_GROUP', 'product_groups', id);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product group:', error);
    res.status(500).json({ error: 'Failed to fetch product group' });
  }
});

// Create new product group
router.post('/', auth, [
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
  body('quantity_type').isIn(['weight', 'units']).withMessage('Quantity type must be either "weight" or "units"'),
  body('original_quantity').isFloat({ min: 0.01 }).withMessage('Original quantity must be a positive number'),
  body('shipment_date').isISO8601().toDate().withMessage('Valid shipment date is required'),
  body('reservation_type').isIn(['weight', 'units']).withMessage('Reservation type must be either "weight" or "units"'),
  body('reservation_amount').optional().isFloat({ min: 0 }).withMessage('Reservation amount must be a non-negative number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      quantity_type,
      original_quantity,
      shipment_date,
      reservation_type,
      reservation_amount = 0
    } = req.body;

    // Calculate initial stock: original_quantity - 5% - reservations
    const deduction = original_quantity * 0.05;
    const current_quantity = Math.max(0, original_quantity - deduction - reservation_amount);

    const query = `
      INSERT INTO product_groups (
        name, quantity_type, original_quantity, current_quantity, 
        shipment_date, reservation_type, reservation_amount, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      name,
      quantity_type,
      original_quantity,
      current_quantity,
      shipment_date,
      reservation_type,
      reservation_amount,
      req.user.id
    ];

    const result = await pool.query(query, values);
    const productGroup = result.rows[0];

    await logActivity(req.user.id, 'CREATE_PRODUCT_GROUP', 'product_groups', productGroup.id, {
      name,
      quantity_type,
      original_quantity,
      current_quantity,
      shipment_date,
      reservation_amount
    });

    res.status(201).json(productGroup);
  } catch (error) {
    console.error('Error creating product group:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Product group with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create product group' });
  }
});

// Update product group
router.put('/:id', auth, [
  param('id').isUUID().withMessage('Invalid group ID'),
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be less than 255 characters'),
  body('quantity_type').optional().isIn(['weight', 'units']).withMessage('Quantity type must be either "weight" or "units"'),
  body('original_quantity').optional().isFloat({ min: 0.01 }).withMessage('Original quantity must be a positive number'),
  body('shipment_date').optional().isISO8601().toDate().withMessage('Valid shipment date is required'),
  body('reservation_type').optional().isIn(['weight', 'units']).withMessage('Reservation type must be either "weight" or "units"'),
  body('reservation_amount').optional().isFloat({ min: 0 }).withMessage('Reservation amount must be a non-negative number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCounter = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    const query = `
      UPDATE product_groups 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCounter}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product group not found' });
    }

    const productGroup = result.rows[0];

    await logActivity(req.user.id, 'UPDATE_PRODUCT_GROUP', 'product_groups', id, updates);

    res.json(productGroup);
  } catch (error) {
    console.error('Error updating product group:', error);
    res.status(500).json({ error: 'Failed to update product group' });
  }
});

// Add product to group
router.post('/:id/products', auth, [
  param('id').isUUID().withMessage('Invalid group ID'),
  body('product_id').isUUID().withMessage('Valid product ID is required')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: group_id } = req.params;
    const { product_id } = req.body;

    await client.query('BEGIN');

    // Check if group exists
    const groupCheck = await client.query('SELECT * FROM product_groups WHERE id = $1', [group_id]);
    if (groupCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product group not found' });
    }

    // Check if product exists and has weight
    const productCheck = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productCheck.rows[0];
    if (!product.weight || product.weight <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Product must have a valid weight to be added to a group' });
    }

    // Check if product is already in any group
    const existingGroup = await client.query(
      'SELECT pg.name FROM product_group_items pgi JOIN product_groups pg ON pgi.group_id = pg.id WHERE pgi.product_id = $1',
      [product_id]
    );

    if (existingGroup.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: `Product is already in group: ${existingGroup.rows[0].name}` 
      });
    }

    // Add product to group
    const insertQuery = `
      INSERT INTO product_group_items (group_id, product_id)
      VALUES ($1, $2)
      RETURNING *
    `;

    await client.query(insertQuery, [group_id, product_id]);
    await client.query('COMMIT');

    await logActivity(req.user.id, 'ADD_PRODUCT_TO_GROUP', 'product_groups', group_id, {
      product_id,
      product_code: product.code,
      product_name: product.name
    });

    res.status(201).json({ message: 'Product added to group successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding product to group:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Product is already in this group' });
    }
    res.status(500).json({ error: 'Failed to add product to group' });
  } finally {
    client.release();
  }
});

// Remove product from group
router.delete('/:id/products/:product_id', auth, [
  param('id').isUUID().withMessage('Invalid group ID'),
  param('product_id').isUUID().withMessage('Invalid product ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: group_id, product_id } = req.params;

    const query = `
      DELETE FROM product_group_items 
      WHERE group_id = $1 AND product_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [group_id, product_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found in this group' });
    }

    await logActivity(req.user.id, 'REMOVE_PRODUCT_FROM_GROUP', 'product_groups', group_id, {
      product_id
    });

    res.json({ message: 'Product removed from group successfully' });
  } catch (error) {
    console.error('Error removing product from group:', error);
    res.status(500).json({ error: 'Failed to remove product from group' });
  }
});

// Delete product group
router.delete('/:id', auth, [
  param('id').isUUID().withMessage('Invalid group ID')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    // Get group info before deletion
    const groupInfo = await client.query('SELECT name FROM product_groups WHERE id = $1', [id]);
    if (groupInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product group not found' });
    }

    // Delete group (cascade will delete related product_group_items)
    await client.query('DELETE FROM product_groups WHERE id = $1', [id]);
    
    await client.query('COMMIT');

    await logActivity(req.user.id, 'DELETE_PRODUCT_GROUP', 'product_groups', id, {
      name: groupInfo.rows[0].name
    });

    res.json({ message: 'Product group deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting product group:', error);
    res.status(500).json({ error: 'Failed to delete product group' });
  } finally {
    client.release();
  }
});

// Update stock when invoice is approved
router.post('/update-stock', auth, [
  body('invoice_items').isArray().withMessage('Invoice items must be an array'),
  body('invoice_items.*.product').isObject().withMessage('Each item must have a product object'),
  body('invoice_items.*.quantity').isInt({ min: 1 }).withMessage('Each item must have a positive quantity')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { invoice_items } = req.body;

    await client.query('BEGIN');

    const stockUpdates = [];

    for (const item of invoice_items) {
      const { product, quantity } = item;

      // Find if this product belongs to any group
      const groupQuery = `
        SELECT pg.id, pg.current_quantity, pg.quantity_type
        FROM product_groups pg
        JOIN product_group_items pgi ON pg.id = pgi.group_id
        WHERE pgi.product_id = $1
      `;

      const groupResult = await client.query(groupQuery, [product.id]);

      if (groupResult.rows.length > 0) {
        const group = groupResult.rows[0];
        const weightUsed = product.weight * quantity;

        // Update group stock
        const newQuantity = Math.max(0, group.current_quantity - weightUsed);
        
        await client.query(
          'UPDATE product_groups SET current_quantity = $1 WHERE id = $2',
          [newQuantity, group.id]
        );

        stockUpdates.push({
          group_id: group.id,
          product_code: product.code,
          product_name: product.name,
          quantity_used: quantity,
          weight_used: weightUsed,
          old_stock: group.current_quantity,
          new_stock: newQuantity
        });
      }
    }

    await client.query('COMMIT');

    if (stockUpdates.length > 0) {
      await logActivity(req.user.id, 'UPDATE_STOCK_ON_INVOICE_APPROVAL', 'product_groups', null, {
        updates: stockUpdates
      });
    }

    res.json({ 
      message: 'Stock updated successfully',
      updates: stockUpdates 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  } finally {
    client.release();
  }
});

module.exports = router;

