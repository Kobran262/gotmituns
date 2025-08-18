const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database migrations...');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = __dirname;
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('ℹ️  No migration files found');
      return;
    }

    // Check which migrations have already been run
    const executedMigrations = await client.query(
      'SELECT filename FROM migrations ORDER BY id'
    );
    const executedFilenames = executedMigrations.rows.map(row => row.filename);

    console.log(`📋 Found ${migrationFiles.length} migration file(s)`);
    console.log(`✅ ${executedFilenames.length} migration(s) already executed`);

    // Run pending migrations
    for (const filename of migrationFiles) {
      if (executedFilenames.includes(filename)) {
        console.log(`⏭️  Skipping ${filename} (already executed)`);
        continue;
      }

      console.log(`🔄 Running migration: ${filename}`);
      
      try {
        await client.query('BEGIN');

        // Read and execute migration file
        const migrationPath = path.join(migrationsDir, filename);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query(migrationSQL);

        // Record migration as executed
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );

        await client.query('COMMIT');
        console.log(`✅ Migration ${filename} completed successfully`);

      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration ${filename} failed:`, error.message);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration process failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Show migration status
async function showMigrationStatus() {
  const client = await pool.connect();
  
  try {
    console.log('📊 Migration Status:');
    console.log('==================');

    // Check if migrations table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log('ℹ️  Migrations table does not exist. Run migrations first.');
      return;
    }

    // Get executed migrations
    const executedMigrations = await client.query(
      'SELECT filename, executed_at FROM migrations ORDER BY id'
    );

    // Get available migration files
    const migrationsDir = __dirname;
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const executedFilenames = executedMigrations.rows.map(row => row.filename);

    console.log('\nAvailable Migrations:');
    migrationFiles.forEach(filename => {
      const isExecuted = executedFilenames.includes(filename);
      const status = isExecuted ? '✅ EXECUTED' : '⏳ PENDING';
      const executedAt = isExecuted 
        ? ` (${executedMigrations.rows.find(r => r.filename === filename).executed_at.toISOString()})`
        : '';
      
      console.log(`  ${filename} - ${status}${executedAt}`);
    });

    const pendingCount = migrationFiles.length - executedFilenames.length;
    console.log(`\nSummary: ${executedFilenames.length} executed, ${pendingCount} pending`);

  } catch (error) {
    console.error('❌ Failed to show migration status:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Create a new migration file
async function createMigration(name) {
  if (!name) {
    console.error('❌ Migration name is required');
    console.log('Usage: node migrate.js create <migration_name>');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[-T:]/g, '').split('.')[0];
  const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
  const filepath = path.join(__dirname, filename);

  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Don't forget to add indexes if needed
-- CREATE INDEX idx_example_name ON example(name);
`;

  try {
    fs.writeFileSync(filepath, template);
    console.log(`✅ Created migration file: ${filename}`);
    console.log(`📝 Edit the file to add your migration SQL`);
  } catch (error) {
    console.error('❌ Failed to create migration file:', error);
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'status':
      await showMigrationStatus();
      break;
    case 'create':
      await createMigration(arg);
      break;
    case 'up':
    default:
      await runMigrations();
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runMigrations,
  showMigrationStatus,
  createMigration
};