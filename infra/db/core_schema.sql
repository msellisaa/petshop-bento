CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL,
  stock INT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  qty INT NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  google_id TEXT UNIQUE,
  auth_provider TEXT NOT NULL DEFAULT 'password',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'member',
  total_spend INT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'Bronze',
  wallet_balance INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE otp_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE otp_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE loyalty_tiers (
  name TEXT PRIMARY KEY,
  min_spend INT NOT NULL,
  discount_pct INT NOT NULL,
  cashback_pct INT NOT NULL
);

CREATE TABLE vouchers (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value INT NOT NULL,
  min_spend INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 0,
  uses INT NOT NULL DEFAULT 0,
  expires_at DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code TEXT REFERENCES vouchers(code),
  used BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID REFERENCES carts(id),
  user_id UUID REFERENCES users(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  subtotal INT NOT NULL DEFAULT 0,
  discount INT NOT NULL DEFAULT 0,
  voucher_code TEXT,
  cashback INT NOT NULL DEFAULT 0,
  wallet_used INT NOT NULL DEFAULT 0,
  shipping_fee INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  flat_fee INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE delivery_settings (
  id INT PRIMARY KEY,
  base_lat DOUBLE PRECISION NOT NULL DEFAULT -6.2216339332113595,
  base_lng DOUBLE PRECISION NOT NULL DEFAULT 106.34573045889455,
  per_km_rate INT NOT NULL DEFAULT 3000,
  min_fee INT NOT NULL DEFAULT 8000
);

INSERT INTO loyalty_tiers (name, min_spend, discount_pct, cashback_pct) VALUES
('Bronze', 0, 0, 0),
('Silver', 1000000, 2, 1),
('Gold', 3000000, 4, 2),
('Platinum', 6000000, 7, 3);

INSERT INTO categories (name) VALUES
('Makanan Kucing'),
('Obat & Vitamin'),
('Minuman'),
('Peralatan Kucing');

INSERT INTO products (category_id, name, description, price, stock, image_url)
SELECT c.id, 'Whiskas Adult 1.2kg', 'Makanan kucing dewasa rasa tuna', 68000, 25, ''
FROM categories c WHERE c.name='Makanan Kucing';

INSERT INTO products (category_id, name, description, price, stock, image_url)
SELECT c.id, 'Cat Cage Medium', 'Kandang kucing ukuran sedang', 350000, 5, ''
FROM categories c WHERE c.name='Peralatan Kucing';

INSERT INTO vouchers (code, title, discount_type, discount_value, min_spend, max_uses, expires_at, active)
VALUES
('WELCOME50', 'Voucher Member Baru', 'flat', 50000, 200000, 0, NULL, TRUE),
('SILVER100', 'Reward Silver', 'flat', 100000, 300000, 0, NULL, TRUE),
('GOLD200', 'Reward Gold', 'flat', 200000, 500000, 0, NULL, TRUE),
('PLAT300', 'Reward Platinum', 'flat', 300000, 800000, 0, NULL, TRUE);

INSERT INTO delivery_settings (id, base_lat, base_lng, per_km_rate, min_fee)
VALUES (1, -6.2216339332113595, 106.34573045889455, 3000, 8000);

INSERT INTO delivery_zones (name, flat_fee, active)
VALUES
('Cikande', 10000, TRUE),
('Serang', 15000, TRUE),
('Tangerang', 20000, TRUE);
