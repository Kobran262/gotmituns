const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const { authenticateToken: auth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { pool } = require('../config/database');

const router = express.Router();

// Get all deliveries with pagination and search
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('status').optional().isIn(['draft', 'confirmed']).withMessage('Status must be draft or confirmed'),
  query('client_id').optional().isUUID().withMessage('Client ID must be a valid UUID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;
    const client_id = req.query.client_id;

    let whereConditions = [];
    let queryParams = [limit, offset];
    let paramIndex = 3;

    if (search) {
      whereConditions.push(`(d.number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`d.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (client_id) {
      whereConditions.push(`d.client_id = $${paramIndex}`);
      queryParams.push(client_id);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const deliveriesQuery = `
      SELECT 
        d.id, d.number, d.date, d.due_date, d.delivery_method,
        d.status, d.is_signed, d.notes, d.created_at, d.updated_at,
        c.name as client_name, c.legal_name as client_legal_name,
        COUNT(di.id) as item_count
      FROM deliveries d
      JOIN clients c ON d.client_id = c.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      ${whereClause}
      GROUP BY d.id, d.number, d.date, d.due_date, d.delivery_method,
               d.status, d.is_signed, d.notes, d.created_at, d.updated_at,
               c.name, c.legal_name
      ORDER BY d.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(deliveriesQuery, queryParams);

    // Get total count
    const countParams = queryParams.slice(2); // Remove limit and offset
    const countQuery = `
      SELECT COUNT(DISTINCT d.id) as total 
      FROM deliveries d
      JOIN clients c ON d.client_id = c.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, countParams);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      deliveries: result.rows,
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
    console.error('Get deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// Get single delivery by ID
router.get('/:id', auth, [
  param('id').isUUID().withMessage('Invalid delivery ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const deliveryQuery = `
      SELECT 
        d.id, d.number, d.date, d.due_date, d.delivery_method,
        d.status, d.is_signed, d.notes, d.created_at, d.updated_at,
        c.id as client_id, c.name as client_name, c.legal_name as client_legal_name,
        c.address as client_address, c.mb as client_mb, c.pib as client_pib
      FROM deliveries d
      JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1
    `;

    const deliveryResult = await pool.query(deliveryQuery, [id]);

    if (deliveryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Get delivery items
    const itemsQuery = `
      SELECT 
        di.id, di.quantity, di.unit,
        p.id as product_id, p.code as product_code, p.name as product_name,
        p.weight as product_weight
      FROM delivery_items di
      JOIN products p ON di.product_id = p.id
      WHERE di.delivery_id = $1
      ORDER BY di.created_at
    `;

    const itemsResult = await pool.query(itemsQuery, [id]);

    const delivery = {
      ...deliveryResult.rows[0],
      items: itemsResult.rows
    };

    res.json(delivery);

  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'Failed to fetch delivery' });
  }
});

// Create new delivery
router.post('/', auth, [
  body('number').trim().isLength({ min: 1 }).withMessage('Delivery number is required'),
  body('date').isISO8601().toDate().withMessage('Valid date is required'),
  body('due_date').isISO8601().toDate().withMessage('Valid due date is required'),
  body('client_id').isUUID().withMessage('Valid client ID is required'),
  body('delivery_method').optional().isString().withMessage('Delivery method must be a string'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isUUID().withMessage('Valid product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('items.*.unit').optional().isString().withMessage('Unit must be a string'),
  body('notes').optional().isString().withMessage('Notes must be a string')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      number, date, due_date, client_id, delivery_method, items, notes
    } = req.body;

    await client.query('BEGIN');

    // Check if delivery number already exists
    const existingDelivery = await client.query(
      'SELECT id FROM deliveries WHERE number = $1',
      [number]
    );

    if (existingDelivery.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Delivery number already exists' });
    }

    // Create delivery
    const deliveryQuery = `
      INSERT INTO deliveries (
        number, date, due_date, client_id, delivery_method, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const deliveryResult = await client.query(deliveryQuery, [
      number, date, due_date, client_id, delivery_method, notes, req.user.id
    ]);

    const delivery = deliveryResult.rows[0];

    // Create delivery items
    for (const item of items) {
      await client.query(
        `INSERT INTO delivery_items (delivery_id, product_id, quantity, unit)
         VALUES ($1, $2, $3, $4)`,
        [delivery.id, item.product_id, item.quantity, item.unit || 'ком']
      );
    }

    await client.query('COMMIT');

    await logActivity(req.user.id, 'CREATE_DELIVERY', 'deliveries', delivery.id, {
      number,
      client_id,
      item_count: items.length
    });

    res.status(201).json({
      message: 'Delivery created successfully',
      delivery
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Failed to create delivery' });
  } finally {
    client.release();
  }
});

// Update delivery status (confirm/draft)
router.patch('/:id/status', auth, [
  param('id').isUUID().withMessage('Invalid delivery ID'),
  body('status').isIn(['draft', 'confirmed']).withMessage('Status must be draft or confirmed')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      'UPDATE deliveries SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const delivery = result.rows[0];

    await logActivity(req.user.id, `UPDATE_DELIVERY_STATUS_${status.toUpperCase()}`, 'deliveries', id, {
      old_status: delivery.status,
      new_status: status
    });

    res.json({
      message: `Delivery ${status === 'confirmed' ? 'confirmed' : 'set to draft'} successfully`,
      delivery
    });

  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// Update delivery signed status
router.patch('/:id/signed', auth, [
  param('id').isUUID().withMessage('Invalid delivery ID'),
  body('is_signed').isBoolean().withMessage('is_signed must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { is_signed } = req.body;

    const result = await pool.query(
      'UPDATE deliveries SET is_signed = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [is_signed, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const delivery = result.rows[0];

    await logActivity(req.user.id, 'UPDATE_DELIVERY_SIGNED', 'deliveries', id, {
      is_signed
    });

    res.json({
      message: `Delivery ${is_signed ? 'marked as signed' : 'marked as unsigned'} successfully`,
      delivery
    });

  } catch (error) {
    console.error('Update delivery signed status error:', error);
    res.status(500).json({ error: 'Failed to update delivery signed status' });
  }
});

// Delete delivery
router.delete('/:id', auth, [
  param('id').isUUID().withMessage('Invalid delivery ID')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    // Get delivery info for logging
    const deliveryInfo = await client.query(
      'SELECT number, status FROM deliveries WHERE id = $1',
      [id]
    );

    if (deliveryInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const delivery = deliveryInfo.rows[0];

    // Don't allow deletion of confirmed deliveries
    if (delivery.status === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot delete confirmed delivery' });
    }

    // Delete delivery (cascade will delete items)
    await client.query('DELETE FROM deliveries WHERE id = $1', [id]);

    await client.query('COMMIT');

    await logActivity(req.user.id, 'DELETE_DELIVERY', 'deliveries', id, {
      number: delivery.number
    });

    res.json({ message: 'Delivery deleted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete delivery error:', error);
    res.status(500).json({ error: 'Failed to delete delivery' });
  } finally {
    client.release();
  }
});

module.exports = router;

