#!/bin/sh

# ==============================================
# SRECHA INVOICE DATABASE BACKUP SCRIPT
# ==============================================

set -e

# Configuration
DB_HOST="postgres"
DB_NAME="srecha_invoice"
DB_USER="postgres"
BACKUP_DIR="/backups"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/srecha_invoice_backup_$TIMESTAMP.sql"

echo "🔄 Starting database backup..."
echo "📅 Timestamp: $TIMESTAMP"
echo "🗄️ Database: $DB_NAME"
echo "📁 Backup file: $BACKUP_FILE"

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME"; do
    echo "Database is not ready yet. Waiting..."
    sleep 2
done

# Create backup
echo "💾 Creating database backup..."
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_FILE.custom"

# Also create SQL dump for easy restore
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --no-password \
    --format=plain \
    --file="$BACKUP_FILE"

# Compress SQL file
gzip "$BACKUP_FILE"

echo "✅ Backup completed successfully!"
echo "📦 Custom format: $BACKUP_FILE.custom"
echo "📦 SQL format: $BACKUP_FILE.gz"

# Calculate sizes
CUSTOM_SIZE=$(du -h "$BACKUP_FILE.custom" | cut -f1)
SQL_SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)

echo "📏 Custom backup size: $CUSTOM_SIZE"
echo "📏 SQL backup size: $SQL_SIZE"

# Clean up old backups
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."

find "$BACKUP_DIR" -name "srecha_invoice_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "srecha_invoice_backup_*.custom" -mtime +$RETENTION_DAYS -delete

REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "srecha_invoice_backup_*" | wc -l)
echo "📊 Remaining backups: $REMAINING_BACKUPS"

echo "🎉 Backup process completed!"

# Create restore instructions
cat > "$BACKUP_DIR/RESTORE_INSTRUCTIONS.md" << EOF
# Database Restore Instructions

## Using Custom Format (Recommended)
\`\`\`bash
pg_restore -h postgres -U postgres -d srecha_invoice --clean --if-exists srecha_invoice_backup_TIMESTAMP.sql.custom
\`\`\`

## Using SQL Format
\`\`\`bash
gunzip -c srecha_invoice_backup_TIMESTAMP.sql.gz | psql -h postgres -U postgres -d srecha_invoice
\`\`\`

## Latest Backup
Latest backup created: $TIMESTAMP
- Custom format: srecha_invoice_backup_$TIMESTAMP.sql.custom ($CUSTOM_SIZE)
- SQL format: srecha_invoice_backup_$TIMESTAMP.sql.gz ($SQL_SIZE)

## Restore Steps
1. Stop the application: \`docker-compose stop backend\`
2. Drop and recreate database (if needed):
   \`\`\`bash
   docker-compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS srecha_invoice;"
   docker-compose exec postgres psql -U postgres -c "CREATE DATABASE srecha_invoice;"
   \`\`\`
3. Restore backup using one of the methods above
4. Start the application: \`docker-compose start backend\`
EOF

echo "📖 Restore instructions created: $BACKUP_DIR/RESTORE_INSTRUCTIONS.md"


