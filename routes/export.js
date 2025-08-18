const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper function to generate CSV content
const generateCSV = (headers, rows) => {
  const csvHeaders = headers.join(',');
  const csvRows = rows.map(row => 
    headers.map(header => {
      const value = row[header.toLowerCase().replace(/ /g, '_')] || '';
      // Escape quotes and wrap in quotes if contains comma or quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
};

// Export invoices to Excel/CSV
router.get('/invoices/excel', authenticateToken, requirePermission('statistics'), async (req, res) => {
  try {
    const { format = 'csv', status, client_id, start_date, end_date } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

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

    if (start_date) {
      whereConditions.push(`i.date >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`i.date <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const query = `
      SELECT 
        i.number as "Invoice Number",
        i.date as "Date",
        i.due_date as "Due Date",
        c.name as "Client Name",
        c.legal_name as "Client Legal Name",
        i.subtotal as "Subtotal",
        i.vat_amount as "VAT Amount",
        i.total as "Total",
        i.status as "Status",
        CASE WHEN i.is_delivered THEN 'Yes' ELSE 'No' END as "Delivered",
        CASE WHEN i.is_paid THEN 'Yes' ELSE 'No' END as "Paid",
        i.notes as "Notes",
        i.created_at as "Created At"
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      ${whereClause}
      ORDER BY i.date DESC
    `;

    const result = await pool.query(query, queryParams);

    if (format === 'json') {
      res.json(result.rows);
      return;
    }

    const headers = [
      'Invoice Number', 'Date', 'Due Date', 'Client Name', 'Client Legal Name',
      'Subtotal', 'VAT Amount', 'Total', 'Status', 'Delivered', 'Paid', 'Notes', 'Created At'
    ];

    const csvContent = generateCSV(headers, result.rows);

    await logActivity(req.user.id, 'EXPORT_INVOICES', 'invoices', null, {
      format,
      count: result.rows.length,
      filters: { status, client_id, start_date, end_date }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoices_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export invoices error:', error);
    res.status(500).json({ error: 'Failed to export invoices' });
  }
});

// Export deliveries to Excel/CSV
router.get('/deliveries/excel', authenticateToken, requirePermission('statistics'), async (req, res) => {
  try {
    const { format = 'csv', status, client_id, start_date, end_date } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

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

    if (start_date) {
      whereConditions.push(`d.date >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`d.date <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const query = `
      SELECT 
        d.number as "Delivery Number",
        d.date as "Date",
        d.due_date as "Due Date",
        c.name as "Client Name",
        c.legal_name as "Client Legal Name",
        d.delivery_method as "Delivery Method",
        d.status as "Status",
        CASE WHEN d.is_signed THEN 'Yes' ELSE 'No' END as "Signed",
        d.notes as "Notes",
        d.created_at as "Created At"
      FROM deliveries d
      JOIN clients c ON d.client_id = c.id
      ${whereClause}
      ORDER BY d.date DESC
    `;

    const result = await pool.query(query, queryParams);

    if (format === 'json') {
      res.json(result.rows);
      return;
    }

    const headers = [
      'Delivery Number', 'Date', 'Due Date', 'Client Name', 'Client Legal Name',
      'Delivery Method', 'Status', 'Signed', 'Notes', 'Created At'
    ];

    const csvContent = generateCSV(headers, result.rows);

    await logActivity(req.user.id, 'EXPORT_DELIVERIES', 'deliveries', null, {
      format,
      count: result.rows.length,
      filters: { status, client_id, start_date, end_date }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="deliveries_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export deliveries error:', error);
    res.status(500).json({ error: 'Failed to export deliveries' });
  }
});

// Export clients to Excel/CSV
router.get('/clients/excel', authenticateToken, requirePermission('clients'), async (req, res) => {
  try {
    const { format = 'csv', search } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR legal_name ILIKE $${paramIndex} OR mb ILIKE $${paramIndex} OR pib ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const query = `
      SELECT 
        name as "Name",
        legal_name as "Legal Name",
        mb as "MB",
        pib as "PIB",
        address as "Address",
        city as "City",
        municipality as "Municipality",
        contact_person as "Contact Person",
        phone as "Phone",
        email as "Email",
        telegram as "Telegram",
        instagram as "Instagram",
        CASE WHEN installment_payment THEN 'Yes' ELSE 'No' END as "Installment Payment",
        installment_term as "Installment Term",
        CASE WHEN showcase THEN 'Yes' ELSE 'No' END as "Showcase",
        CASE WHEN bar THEN 'Yes' ELSE 'No' END as "Bar",
        notes as "Notes",
        created_at as "Created At"
      FROM clients
      ${whereClause}
      ORDER BY name ASC
    `;

    const result = await pool.query(query, queryParams);

    if (format === 'json') {
      res.json(result.rows);
      return;
    }

    const headers = [
      'Name', 'Legal Name', 'MB', 'PIB', 'Address', 'City', 'Municipality',
      'Contact Person', 'Phone', 'Email', 'Telegram', 'Instagram',
      'Installment Payment', 'Installment Term', 'Showcase', 'Bar', 'Notes', 'Created At'
    ];

    const csvContent = generateCSV(headers, result.rows);

    await logActivity(req.user.id, 'EXPORT_CLIENTS', 'clients', null, {
      format,
      count: result.rows.length,
      filters: { search }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export clients error:', error);
    res.status(500).json({ error: 'Failed to export clients' });
  }
});

// Export products to Excel/CSV
router.get('/products/excel', authenticateToken, requirePermission('products'), async (req, res) => {
  try {
    const { format = 'csv', category, active_only, search } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

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

    if (active_only === 'true') {
      whereConditions.push('is_active = true');
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const query = `
      SELECT 
        code as "Code",
        name as "Name",
        price as "Price",
        weight as "Weight (g)",
        category as "Category",
        description as "Description",
        CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END as "Status",
        created_at as "Created At"
      FROM products
      ${whereClause}
      ORDER BY name ASC
    `;

    const result = await pool.query(query, queryParams);

    if (format === 'json') {
      res.json(result.rows);
      return;
    }

    const headers = [
      'Code', 'Name', 'Price', 'Weight (g)', 'Category', 'Description', 'Status', 'Created At'
    ];

    const csvContent = generateCSV(headers, result.rows);

    await logActivity(req.user.id, 'EXPORT_PRODUCTS', 'products', null, {
      format,
      count: result.rows.length,
      filters: { category, active_only, search }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="products_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export products error:', error);
    res.status(500).json({ error: 'Failed to export products' });
  }
});

// Export product groups to Excel/CSV
router.get('/product-groups/excel', authenticateToken, requirePermission('warehouse'), async (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    const query = `
      SELECT 
        pg.name as "Group Name",
        pg.quantity_type as "Quantity Type",
        pg.original_quantity as "Original Quantity",
        pg.current_quantity as "Current Quantity",
        pg.shipment_date as "Shipment Date",
        pg.reservation_type as "Reservation Type",
        pg.reservation_amount as "Reservation Amount",
        ARRAY_AGG(p.name ORDER BY p.name) as "Products",
        pg.created_at as "Created At"
      FROM product_groups pg
      LEFT JOIN product_group_items pgi ON pg.id = pgi.group_id
      LEFT JOIN products p ON pgi.product_id = p.id
      GROUP BY pg.id, pg.name, pg.quantity_type, pg.original_quantity, 
               pg.current_quantity, pg.shipment_date, pg.reservation_type, 
               pg.reservation_amount, pg.created_at
      ORDER BY pg.created_at DESC
    `;

    const result = await pool.query(query);

    // Process the products array
    const processedRows = result.rows.map(row => ({
      ...row,
      Products: row.Products ? row.Products.filter(p => p).join('; ') : ''
    }));

    if (format === 'json') {
      res.json(processedRows);
      return;
    }

    const headers = [
      'Group Name', 'Quantity Type', 'Original Quantity', 'Current Quantity',
      'Shipment Date', 'Reservation Type', 'Reservation Amount', 'Products', 'Created At'
    ];

    const csvContent = generateCSV(headers, processedRows);

    await logActivity(req.user.id, 'EXPORT_PRODUCT_GROUPS', 'product_groups', null, {
      format,
      count: result.rows.length
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="product_groups_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export product groups error:', error);
    res.status(500).json({ error: 'Failed to export product groups' });
  }
});

module.exports = router;

