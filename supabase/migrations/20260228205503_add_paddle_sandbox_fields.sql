-- Migration: Add Paddle sandbox-specific billing fields
--
-- Purpose:
-- 1. Allow one environment toggle (PADDLE_SANDBOX) without overwriting live IDs
-- 2. Store sandbox price IDs alongside existing live price IDs
-- 3. Keep webhook and subscription status tracking isolated per environment

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS paddle_price_id_sandbox TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_paddle_price_id_sandbox
ON plans (paddle_price_id_sandbox)
WHERE paddle_price_id_sandbox IS NOT NULL;

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS paddle_customer_id_sandbox TEXT;

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS paddle_subscription_id_sandbox TEXT;

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS subscription_status_sandbox TEXT NOT NULL DEFAULT 'inactive';

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS current_period_ends_at_sandbox TIMESTAMPTZ;

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS paddle_updated_at_sandbox TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_paddle_subscription_id_sandbox
ON organisations (paddle_subscription_id_sandbox)
WHERE paddle_subscription_id_sandbox IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organisations_paddle_customer_id_sandbox
ON organisations (paddle_customer_id_sandbox)
WHERE paddle_customer_id_sandbox IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_organisations_subscription_status_sandbox'
    ) THEN
        ALTER TABLE organisations
        ADD CONSTRAINT chk_organisations_subscription_status_sandbox
        CHECK (subscription_status_sandbox IN ('inactive', 'active', 'trialing', 'past_due', 'paused', 'canceled', 'cancelled', 'unknown'));
    END IF;
END $$;
