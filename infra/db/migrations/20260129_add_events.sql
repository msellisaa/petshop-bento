CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_user_id_idx ON events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_session_id_idx ON events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_product_id_idx ON events(product_id, created_at DESC);
