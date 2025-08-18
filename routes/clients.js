const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateClient, validateUUID, validatePagination } = require('../middleware/validation');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// Get all clients with pagination and search
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = '';
    let queryParams = [limit, offset];
    
    if (search) {
      whereClause = `WHERE name ILIKE $3 OR mb ILIKE $3 OR pib ILIKE $3`;
      queryParams.push(`%${search}%`);
    }

    // Get clients with pagination
    const clientsResult = await query(
      `SELECT id, name, legal_name, mb, pib, address, city, municipality, street, house_number, 
              google_maps_link, contact_person, contact, bank_info, is_manual_address,
              telegram, instagram, phone, email, installment_payment, installment_term,
              showcase, bar, notes, created_at, updated_at
       FROM clients 
       ${whereClause}
       ORDER BY name ASC 
       LIMIT $1 OFFSET $2`,
      queryParams
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM clients ${whereClause}`,
      search ? [`%${search}%`] : []
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      clients: clientsResult.rows,
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
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get single client by ID
router.get('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, legal_name, mb, pib, address, city, municipality, street, house_number,
              google_maps_link, contact_person, contact, bank_info, is_manual_address,
              telegram, instagram, phone, email, installment_payment, installment_term,
              showcase, bar, notes, created_at, updated_at
       FROM clients WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });

  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create new client
router.post('/', authenticateToken, validateClient, async (req, res) => {
  try {
    const {
      name, legal_name, mb, pib, address, city, municipality, street, house_number,
      google_maps_link, contact_person, contact, bank_info, is_manual_address,
      telegram, instagram, phone, email, installment_payment, installment_term,
      showcase, bar, notes
    } = req.body;

    // Check if MB or PIB already exists
    const existingClient = await query(
      'SELECT id FROM clients WHERE mb = $1 OR pib = $2',
      [mb, pib]
    );

    if (existingClient.rows.length > 0) {
      return res.status(400).json({ error: 'Client with this MB or PIB already exists' });
    }

    const result = await query(
      `INSERT INTO clients (name, legal_name, mb, pib, address, city, municipality, street, house_number,
                           google_maps_link, contact_person, contact, bank_info, is_manual_address,
                           telegram, instagram, phone, email, installment_payment, installment_term,
                           showcase, bar, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING id, name, legal_name, mb, pib, address, city, municipality, street, house_number,
                google_maps_link, contact_person, contact, bank_info, is_manual_address,
                telegram, instagram, phone, email, installment_payment, installment_term,
                showcase, bar, notes, created_at`,
      [name, legal_name, mb, pib, address, city, municipality, street, house_number,
       google_maps_link, contact_person, contact, bank_info, is_manual_address || false,
       telegram, instagram, phone, email, installment_payment || false, installment_term,
       showcase || false, bar || false, notes, req.user.id]
    );

    const client = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `Created client: ${name}`, 'client', client.id, req);

    res.status(201).json({
      message: 'Client created successfully',
      client
    });

  } catch (error) {
    console.error('Create client error:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Client with this MB or PIB already exists' });
    }
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/:id', authenticateToken, validateUUID, validateClient, async (req, res) => {
  try {
    const {
      name, legal_name, mb, pib, address, city, municipality, street, house_number,
      google_maps_link, contact_person, contact, bank_info, is_manual_address,
      telegram, instagram, phone, email, installment_payment, installment_term,
      showcase, bar, notes
    } = req.body;

    // Check if another client has the same MB or PIB
    const existingClient = await query(
      'SELECT id FROM clients WHERE (mb = $1 OR pib = $2) AND id != $3',
      [mb, pib, req.params.id]
    );

    if (existingClient.rows.length > 0) {
      return res.status(400).json({ error: 'Another client with this MB or PIB already exists' });
    }

    const result = await query(
      `UPDATE clients 
       SET name = $1, legal_name = $2, mb = $3, pib = $4, address = $5, city = $6, municipality = $7,
           street = $8, house_number = $9, google_maps_link = $10, contact_person = $11, contact = $12, 
           bank_info = $13, is_manual_address = $14, telegram = $15, instagram = $16, phone = $17, 
           email = $18, installment_payment = $19, installment_term = $20, showcase = $21, bar = $22, notes = $23
       WHERE id = $24
       RETURNING id, name, legal_name, mb, pib, address, city, municipality, street, house_number,
                google_maps_link, contact_person, contact, bank_info, is_manual_address,
                telegram, instagram, phone, email, installment_payment, installment_term,
                showcase, bar, notes, updated_at`,
      [name, legal_name, mb, pib, address, city, municipality, street, house_number,
       google_maps_link, contact_person, contact, bank_info, is_manual_address || false,
       telegram, instagram, phone, email, installment_payment || false, installment_term,
       showcase || false, bar || false, notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = result.rows[0];

    // Log activity
    await logActivity(req.user.id, `Updated client: ${name}`, 'client', client.id, req);

    res.json({
      message: 'Client updated successfully',
      client
    });

  } catch (error) {
    console.error('Update client error:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Client with this MB or PIB already exists' });
    }
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', authenticateToken, validateUUID, async (req, res) => {
  try {
    // Check if client has any invoices or deliveries
    const dependenciesResult = await query(
      `SELECT 
        (SELECT COUNT(*) FROM invoices WHERE client_id = $1) as invoice_count,
        (SELECT COUNT(*) FROM deliveries WHERE client_id = $1) as delivery_count`,
      [req.params.id]
    );

    const { invoice_count, delivery_count } = dependenciesResult.rows[0];

    if (parseInt(invoice_count) > 0 || parseInt(delivery_count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete client with existing invoices or deliveries',
        details: {
          invoices: parseInt(invoice_count),
          deliveries: parseInt(delivery_count)
        }
      });
    }

    // Get client name for logging
    const clientResult = await query('SELECT name FROM clients WHERE id = $1', [req.params.id]);
    
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientName = clientResult.rows[0].name;

    // Delete client
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Log activity
    await logActivity(req.user.id, `Deleted client: ${clientName}`, 'client', req.params.id, req);

    res.json({ message: 'Client deleted successfully' });

  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Get client's invoices
router.get('/:id/invoices', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `SELECT i.id, i.number, i.date, i.due_date, i.total, i.status, i.is_delivered, i.is_paid,
              COUNT(ii.id) as item_count
       FROM invoices i
       LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
       WHERE i.client_id = $1
       GROUP BY i.id, i.number, i.date, i.due_date, i.total, i.status, i.is_delivered, i.is_paid
       ORDER BY i.date DESC`,
      [req.params.id]
    );

    res.json({ invoices: result.rows });

  } catch (error) {
    console.error('Get client invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch client invoices' });
  }
});

// Get client's deliveries
router.get('/:id/deliveries', authenticateToken, validateUUID, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.number, d.date, d.due_date, d.delivery_method, d.status, d.is_signed,
              COUNT(di.id) as item_count
       FROM deliveries d
       LEFT JOIN delivery_items di ON d.id = di.delivery_id
       WHERE d.client_id = $1
       GROUP BY d.id, d.number, d.date, d.due_date, d.delivery_method, d.status, d.is_signed
       ORDER BY d.date DESC`,
      [req.params.id]
    );

    res.json({ deliveries: result.rows });

  } catch (error) {
    console.error('Get client deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch client deliveries' });
  }
});

// Get client statistics
router.get('/:id/statistics', authenticateToken, validateUUID, async (req, res) => {
  try {
    const { period = 'year' } = req.query; // year, month, quarter

    let dateFilter = '';
    switch (period) {
      case 'month':
        dateFilter = "AND i.date >= date_trunc('month', CURRENT_DATE)";
        break;
      case 'quarter':
        dateFilter = "AND i.date >= date_trunc('quarter', CURRENT_DATE)";
        break;
      case 'year':
      default:
        dateFilter = "AND i.date >= date_trunc('year', CURRENT_DATE)";
        break;
    }

    // Get statistics from confirmed invoices
    const statsQuery = `
      SELECT 
        COUNT(i.id) as invoice_count,
        COALESCE(AVG(i.total), 0) as average_order_value,
        COALESCE(SUM(i.total), 0) as total_revenue,
        (
          SELECT p.name 
          FROM products p
          JOIN invoice_items ii ON p.id = ii.product_id
          JOIN invoices i2 ON ii.invoice_id = i2.id
          WHERE i2.client_id = $1 AND i2.status = 'confirmed' ${dateFilter}
          GROUP BY p.id, p.name
          ORDER BY SUM(ii.quantity) DESC
          LIMIT 1
        ) as most_popular_product,
        (
          SELECT SUM(ii.quantity)
          FROM invoice_items ii
          JOIN invoices i3 ON ii.invoice_id = i3.id
          WHERE i3.client_id = $1 AND i3.status = 'confirmed'
          AND i3.date >= date_trunc('year', CURRENT_DATE)
        ) as annual_consumption
      FROM invoices i
      WHERE i.client_id = $1 AND i.status = 'confirmed' ${dateFilter}
    `;

    const result = await query(statsQuery, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.json({
        statistics: {
          invoice_count: 0,
          average_order_value: 0,
          total_revenue: 0,
          most_popular_product: null,
          annual_consumption: 0,
          period
        }
      });
    }

    const stats = result.rows[0];

    res.json({
      statistics: {
        invoice_count: parseInt(stats.invoice_count),
        average_order_value: parseFloat(stats.average_order_value),
        total_revenue: parseFloat(stats.total_revenue),
        most_popular_product: stats.most_popular_product,
        annual_consumption: parseInt(stats.annual_consumption) || 0,
        period
      }
    });

  } catch (error) {
    console.error('Get client statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch client statistics' });
  }
});

module.exports = router;

