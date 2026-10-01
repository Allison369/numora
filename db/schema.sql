-- TeleRent PostgreSQL Database Schema
-- Provides full state tracking for Customers, Telecom Phone Numbers, Active Leases, SMS Routing & Financial Ledger

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table: platform accounts with wallet balance
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    balance NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    role VARCHAR(50) NOT NULL DEFAULT 'customer', -- 'customer', 'admin'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phone Numbers Table: Inventory pool of numbers acquired from Twilio/Telnyx/Wholesale
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    e164_format VARCHAR(30) UNIQUE NOT NULL, -- e.g. +14155552671
    friendly_name VARCHAR(100),
    country_code VARCHAR(2) NOT NULL, -- US, GB, CA, AU, etc.
    number_type VARCHAR(30) NOT NULL DEFAULT 'local', -- local, toll_free, mobile
    provider VARCHAR(50) NOT NULL DEFAULT 'sandbox', -- twilio, telnyx, sandbox
    provider_sid VARCHAR(100), -- Twilio PNxxx or Telnyx Phone Number ID
    capabilities JSONB NOT NULL DEFAULT '{"sms": true, "voice": true, "mms": false}'::jsonb,
    cost_price_monthly NUMERIC(10, 4) NOT NULL DEFAULT 1.1500, -- Wholesale price paid to carrier
    retail_price_monthly NUMERIC(10, 4) NOT NULL DEFAULT 4.9900, -- Retail rental price
    retail_price_weekly NUMERIC(10, 4) NOT NULL DEFAULT 1.9900,
    status VARCHAR(50) NOT NULL DEFAULT 'available', -- 'available', 'rented', 'cooling_down', 'released'
    current_rental_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for speedy inventory search
CREATE INDEX IF NOT EXISTS idx_phone_numbers_lookup 
ON phone_numbers(country_code, number_type, status);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_e164 
ON phone_numbers(e164_format);

-- Rentals Table: Leases connecting Customers to Numbers
CREATE TABLE IF NOT EXISTS rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
    phone_number VARCHAR(30) NOT NULL, -- Denormalized for zero-join inbound routing
    rental_plan VARCHAR(30) NOT NULL DEFAULT 'monthly', -- 'monthly', 'weekly', 'custom'
    price_paid NUMERIC(10, 4) NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
    webhook_url TEXT, -- Customer forward URL for incoming events
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rentals_routing 
ON rentals(phone_number, status);

CREATE INDEX IF NOT EXISTS idx_rentals_expiration 
ON rentals(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_rentals_user 
ON rentals(user_id, status);

-- Inbound & Outbound SMS Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_id UUID REFERENCES rentals(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL DEFAULT 'inbound', -- 'inbound', 'outbound'
    from_number VARCHAR(30) NOT NULL,
    to_number VARCHAR(30) NOT NULL,
    body TEXT NOT NULL,
    extracted_code VARCHAR(20), -- Extracted OTP / 2FA verification token
    provider VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(100),
    raw_payload JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_user 
ON messages(user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_rental 
ON messages(rental_id, received_at DESC);

-- Transactions & Accounting Ledger
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'deposit', 'rental_purchase', 'rental_renewal', 'refund'
    amount NUMERIC(10, 4) NOT NULL, -- Positive for deposits, negative for purchases
    balance_after NUMERIC(10, 4) NOT NULL,
    reference_id VARCHAR(100), -- payment ID or rental ID
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user 
ON transactions(user_id, created_at DESC);
