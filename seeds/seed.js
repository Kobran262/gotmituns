const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function seedDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    await client.query('BEGIN');

    // Create default admin user (BrankoFND)
    const adminPasswordHash = await bcrypt.hash('MoskvaSlezamNeVeryt2024', 12);
    const adminPermissions = {
      clients: true,
      products: true,
      invoices: true,
      deliveries: true,
      statistics: true,
      warehouse: true,
      editUser: true
    };

    await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, permissions) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (username) DO UPDATE SET 
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         permissions = EXCLUDED.permissions`,
      ['BrankoFND', adminPasswordHash, 'Admin User', 'admin', JSON.stringify(adminPermissions)]
    );

    // Create default test user (тест)
    const testPasswordHash = await bcrypt.hash('тест', 12);
    const testPermissions = {
      clients: true,
      products: true,
      invoices: true,
      deliveries: true,
      statistics: true,
      warehouse: true,
      editUser: false
    };

    await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, permissions) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (username) DO UPDATE SET 
         password_hash = EXCLUDED.password_hash,
         permissions = EXCLUDED.permissions`,
      ['тест', testPasswordHash, 'Test User', 'user', JSON.stringify(testPermissions)]
    );

    console.log('✅ Created default users');

    // Create sample client
    await client.query(
      `INSERT INTO clients (name, legal_name, mb, pib, address, contact_person, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM users WHERE username = 'BrankoFND'))
       ON CONFLICT (mb) DO NOTHING`,
      [
        'Sample Client',
        'Sample Client LLC',
        '12345678',
        '987654321',
        '123 Sample Street, Sample City',
        'John Doe'
      ]
    );

    console.log('✅ Created sample client');

    // Create sample products
    const sampleProducts = [
      { code: 'PROD001', name: 'Sample Product 1', price: 100.00, weight: 500 },
      { code: 'PROD002', name: 'Sample Product 2', price: 150.00, weight: 750 },
      { code: 'PROD003', name: 'Sample Product 3', price: 200.00, weight: 1000 }
    ];

    for (const product of sampleProducts) {
      await client.query(
        `INSERT INTO products (code, name, price, weight, category, created_by) 
         VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE username = 'BrankoFND'))
         ON CONFLICT (code) DO NOTHING`,
        [product.code, product.name, product.price, product.weight, 'Sample Category']
      );
    }

    console.log('✅ Created sample products');

    // Create sample product group
    const groupResult = await client.query(
      `INSERT INTO product_groups (name, quantity_type, original_quantity, current_quantity, shipment_date, reservation_type, reservation_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM users WHERE username = 'BrankoFND'))
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Sample Group', 'weight', 10000, 9000, new Date().toISOString().split('T')[0], 'weight', 500]
    );

    if (groupResult.rows.length > 0) {
      const groupId = groupResult.rows[0].id;
      
      // Add products to the group
      const productIds = await client.query(
        'SELECT id FROM products WHERE code IN ($1, $2)',
        ['PROD001', 'PROD002']
      );

      for (const product of productIds.rows) {
        await client.query(
          'INSERT INTO product_group_items (group_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [groupId, product.id]
        );
      }

      console.log('✅ Created sample product group');
    }

    await client.query('COMMIT');
    console.log('🎉 Database seeding completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;

