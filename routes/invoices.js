const express = require('express');
const { Pool } = require('pg');
const { body, validationResult, param, query } = require('express-validator');
const auth = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all invoices with pagination and search
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
      whereConditions.push(`(i.number ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`i.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (client_id) {
      whereConditions.push(`i.client_id = $${paramIndex}`);
      queryParams.push(client_id);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const invoicesQuery = `
      SELECT 
        i.id, i.number, i.date, i.due_date, i.subtotal, i.vat_amount, i.total,
        i.status, i.is_delivered, i.is_paid, i.reference, i.notes, i.created_at, i.updated_at,
        c.name as client_name, c.legal_name as client_legal_name,
        COUNT(ii.id) as item_count
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      ${whereClause}
      GROUP BY i.id, i.number, i.date, i.due_date, i.subtotal, i.vat_amount, i.total,
               i.status, i.is_delivered, i.is_paid, i.reference, i.notes, i.created_at, i.updated_at,
               c.name, c.legal_name
      ORDER BY i.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(invoicesQuery, queryParams);

    // Get total count
    const countParams = queryParams.slice(2); // Remove limit and offset
    const countQuery = `
      SELECT COUNT(DISTINCT i.id) as total 
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, countParams);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      invoices: result.rows,
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
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get single invoice by ID
router.get('/:id', auth, [
  param('id').isUUID().withMessage('Invalid invoice ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const invoiceQuery = `
      SELECT 
        i.id, i.number, i.date, i.due_date, i.delivery_address, i.vat_rate,
        i.subtotal, i.vat_amount, i.total, i.status, i.is_delivered, i.is_paid,
        i.reference, i.notes, i.created_at, i.updated_at,
        c.id as client_id, c.name as client_name, c.legal_name as client_legal_name,
        c.address as client_address, c.mb as client_mb, c.pib as client_pib
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.id = $1
    `;

    const invoiceResult = await pool.query(invoiceQuery, [id]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get invoice items
    const itemsQuery = `
      SELECT 
        ii.id, ii.quantity, ii.unit_price, ii.total_price,
        p.id as product_id, p.code as product_code, p.name as product_name,
        p.weight as product_weight
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `;

    const itemsResult = await pool.query(itemsQuery, [id]);

    const invoice = {
      ...invoiceResult.rows[0],
      items: itemsResult.rows
    };

    res.json(invoice);

  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Create new invoice
router.post('/', auth, [
  body('number').trim().isLength({ min: 1 }).withMessage('Invoice number is required'),
  body('date').isISO8601().toDate().withMessage('Valid date is required'),
  body('due_date').isISO8601().toDate().withMessage('Valid due date is required'),
  body('client_id').isUUID().withMessage('Valid client ID is required'),
  body('delivery_address').optional().isString().withMessage('Delivery address must be a string'),
  body('vat_rate').isFloat({ min: 0, max: 100 }).withMessage('VAT rate must be between 0 and 100'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isUUID().withMessage('Valid product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Unit price must be non-negative'),
  body('notes').optional().isString().withMessage('Notes must be a string')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      number, date, due_date, client_id, delivery_address,
      vat_rate, reference, items, notes
    } = req.body;

    await client.query('BEGIN');

    // Check if invoice number already exists
    const existingInvoice = await client.query(
      'SELECT id FROM invoices WHERE number = $1',
      [number]
    );

    if (existingInvoice.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Invoice number already exists' });
    }

    // Calculate totals
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price;
      subtotal += totalPrice;
      processedItems.push({
        ...item,
        total_price: totalPrice
      });
    }

    const vat_amount = (subtotal * vat_rate) / 100;
    const total = subtotal + vat_amount;

    // Create invoice
    const invoiceQuery = `
      INSERT INTO invoices (
        number, date, due_date, client_id, delivery_address, vat_rate,
        reference, subtotal, vat_amount, total, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const invoiceResult = await client.query(invoiceQuery, [
      number, date, due_date, client_id, delivery_address, vat_rate,
      reference, subtotal, vat_amount, total, notes, req.user.id
    ]);

    const invoice = invoiceResult.rows[0];

    // Create invoice items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [invoice.id, item.product_id, item.quantity, item.unit_price, item.total_price]
      );
    }

    await client.query('COMMIT');

    await logActivity(req.user.id, 'CREATE_INVOICE', 'invoices', invoice.id, {
      number,
      client_id,
      total,
      item_count: items.length
    });

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    client.release();
  }
});

// Update invoice status (confirm/draft)
router.patch('/:id/status', auth, [
  param('id').isUUID().withMessage('Invalid invoice ID'),
  body('status').isIn(['draft', 'confirmed']).withMessage('Status must be draft or confirmed')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    await client.query('BEGIN');

    // Get current invoice status
    const currentInvoice = await client.query(
      'SELECT status FROM invoices WHERE id = $1',
      [id]
    );

    if (currentInvoice.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const oldStatus = currentInvoice.rows[0].status;

    // Update invoice status
    const result = await client.query(
      'UPDATE invoices SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    const invoice = result.rows[0];

    // If confirming the invoice, update stock levels
    if (status === 'confirmed' && oldStatus !== 'confirmed') {
      // Get invoice items with product details
      const itemsQuery = `
        SELECT 
          ii.quantity,
          p.id, p.code, p.name, p.weight
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = $1
      `;

      const itemsResult = await client.query(itemsQuery, [id]);
      const invoiceItems = itemsResult.rows;

      // Update stock for products in groups
      const stockUpdates = [];

      for (const item of invoiceItems) {
        if (item.weight && item.weight > 0) {
          // Find if this product belongs to any group
          const groupQuery = `
            SELECT pg.id, pg.current_quantity, pg.quantity_type
            FROM product_groups pg
            JOIN product_group_items pgi ON pg.id = pgi.group_id
            WHERE pgi.product_id = $1
          `;

          const groupResult = await client.query(groupQuery, [item.id]);

          if (groupResult.rows.length > 0) {
            const group = groupResult.rows[0];
            const weightUsed = item.weight * item.quantity;

            // Update group stock
            const newQuantity = Math.max(0, group.current_quantity - weightUsed);
            
            await client.query(
              'UPDATE product_groups SET current_quantity = $1 WHERE id = $2',
              [newQuantity, group.id]
            );

            stockUpdates.push({
              group_id: group.id,
              product_code: item.code,
              product_name: item.name,
              quantity_used: item.quantity,
              weight_used: weightUsed,
              old_stock: group.current_quantity,
              new_stock: newQuantity
            });
          }
        }
      }

      if (stockUpdates.length > 0) {
        await logActivity(req.user.id, 'UPDATE_STOCK_ON_INVOICE_CONFIRMATION', 'product_groups', null, {
          invoice_id: id,
          updates: stockUpdates
        });
      }
    }

    await client.query('COMMIT');

    await logActivity(req.user.id, `UPDATE_INVOICE_STATUS_${status.toUpperCase()}`, 'invoices', id, {
      old_status: oldStatus,
      new_status: status
    });

    res.json({
      message: `Invoice ${status === 'confirmed' ? 'confirmed' : 'set to draft'} successfully`,
      invoice
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update invoice status error:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  } finally {
    client.release();
  }
});

// Update delivery and payment status
router.patch('/:id/tracking', auth, [
  param('id').isUUID().withMessage('Invalid invoice ID'),
  body('is_delivered').optional().isBoolean().withMessage('is_delivered must be boolean'),
  body('is_paid').optional().isBoolean().withMessage('is_paid must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { is_delivered, is_paid } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (is_delivered !== undefined) {
      updates.push(`is_delivered = $${paramIndex}`);
      values.push(is_delivered);
      paramIndex++;
    }

    if (is_paid !== undefined) {
      updates.push(`is_paid = $${paramIndex}`);
      values.push(is_paid);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    const query = `
      UPDATE invoices 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = result.rows[0];

    await logActivity(req.user.id, 'UPDATE_INVOICE_TRACKING', 'invoices', id, {
      is_delivered,
      is_paid
    });

    res.json({
      message: 'Invoice tracking updated successfully',
      invoice
    });

  } catch (error) {
    console.error('Update invoice tracking error:', error);
    res.status(500).json({ error: 'Failed to update invoice tracking' });
  }
});

// Delete invoice
router.delete('/:id', auth, [
  param('id').isUUID().withMessage('Invalid invoice ID')
], async (req, res) => {
  const client = await pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    await client.query('BEGIN');

    // Get invoice info for logging
    const invoiceInfo = await client.query(
      'SELECT number, status FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceInfo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceInfo.rows[0];

    // Don't allow deletion of confirmed invoices
    if (invoice.status === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot delete confirmed invoice' });
    }

    // Delete invoice (cascade will delete items)
    await client.query('DELETE FROM invoices WHERE id = $1', [id]);

    await client.query('COMMIT');

    await logActivity(req.user.id, 'DELETE_INVOICE', 'invoices', id, {
      number: invoice.number
    });

    res.json({ message: 'Invoice deleted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  } finally {
    client.release();
  }
});

module.exports = router;
