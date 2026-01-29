ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_idx ON orders(tracking_token);

CREATE TABLE IF NOT EXISTS delivery_tracking_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMP DEFAULT NOW()
);
