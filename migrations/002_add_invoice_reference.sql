-- Add reference field to invoices table
-- Migration: Add invoice reference field
-- Created: 2024-12-19

-- Add reference column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference VARCHAR(50);

-- Add comment to explain the field
COMMENT ON COLUMN invoices.reference IS 'Позив на број - payment reference number for Serbian invoices';


