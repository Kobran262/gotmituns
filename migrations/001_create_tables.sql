-- Create database schema for Srecha Invoice Management System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{}', -- Store tab permissions as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL, -- Юридическое название
    mb VARCHAR(20) UNIQUE NOT NULL, -- Matični broj
    pib VARCHAR(20) UNIQUE NOT NULL, -- PIB
    address TEXT NOT NULL,
    city VARCHAR(100),
    municipality VARCHAR(100),
    street VARCHAR(255),
    house_number VARCHAR(20),
    google_maps_link TEXT, -- Optional Google Maps link
    contact_person VARCHAR(255), -- Контактное лицо
    contact TEXT,
    bank_info TEXT,
    is_manual_address BOOLEAN DEFAULT false,
    -- Contact details (optional)
    telegram VARCHAR(255),
    instagram VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    -- Collaboration terms
    installment_payment BOOLEAN DEFAULT false,
    installment_term INTEGER, -- срок рассрочки в днях
    showcase BOOLEAN DEFAULT false,
    bar BOOLEAN DEFAULT false,
    notes TEXT, -- примечания
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    weight DECIMAL(8,2) DEFAULT 0 CHECK (weight >= 0), -- вес в граммах
    category VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Invoices table
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    due_date DATE NOT NULL,
    client_id UUID NOT NULL REFERENCES clients(id),
    delivery_address TEXT,
    vat_rate DECIMAL(5,2) DEFAULT 20.00 CHECK (vat_rate >= 0 AND vat_rate <= 100),
    reference VARCHAR(50), -- позив на број
    subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
    vat_amount DECIMAL(12,2) NOT NULL CHECK (vat_amount >= 0),
    total DECIMAL(12,2) NOT NULL CHECK (total >= 0),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    is_delivered BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Invoice items table
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deliveries table
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    due_date DATE NOT NULL,
    client_id UUID NOT NULL REFERENCES clients(id),
    delivery_method VARCHAR(100),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    is_signed BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Delivery items table
CREATE TABLE delivery_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) DEFAULT 'ком',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product groups table for warehouse management
CREATE TABLE product_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    quantity_type VARCHAR(10) NOT NULL CHECK (quantity_type IN ('weight', 'units')), -- вес или единицы
    original_quantity DECIMAL(12,2) NOT NULL CHECK (original_quantity > 0), -- исходное количество
    current_quantity DECIMAL(12,2) NOT NULL CHECK (current_quantity >= 0), -- текущий остаток
    shipment_date DATE NOT NULL, -- дата отгрузки
    reservation_type VARCHAR(10) NOT NULL CHECK (reservation_type IN ('weight', 'units')),
    reservation_amount DECIMAL(12,2) DEFAULT 0 CHECK (reservation_amount >= 0), -- резервации на месяц
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Product group items table (связь товаров с группами)
CREATE TABLE product_group_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, product_id) -- один товар может быть только в одной группе
);

-- Activity logs table
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50), -- 'client', 'product', 'invoice', 'delivery', etc.
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_clients_mb ON clients(mb);
CREATE INDEX idx_clients_pib ON clients(pib);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_invoices_number ON invoices(number);
CREATE INDEX idx_invoices_date ON invoices(date);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_deliveries_number ON deliveries(number);
CREATE INDEX idx_deliveries_date ON deliveries(date);
CREATE INDEX idx_deliveries_client_id ON deliveries(client_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_product_groups_name ON product_groups(name);
CREATE INDEX idx_product_groups_shipment_date ON product_groups(shipment_date);
CREATE INDEX idx_product_group_items_group_id ON product_group_items(group_id);
CREATE INDEX idx_product_group_items_product_id ON product_group_items(product_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_groups_updated_at BEFORE UPDATE ON product_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

