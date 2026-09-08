-- =========================================================================
-- LEBON TOY STOCK HUB - SUPABASE SETUP & FULL DATA MIGRATION
-- =========================================================================

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    category TEXT DEFAULT 'ทั่วไป',
    unit TEXT DEFAULT 'ชิ้น',
    cost_price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    profit_per_unit NUMERIC DEFAULT 0,
    margin_percent NUMERIC DEFAULT 0,
    current_stock NUMERIC DEFAULT 0,
    min_alert NUMERIC DEFAULT 5,
    note TEXT DEFAULT '',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS transactions (
    trans_id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    product_id TEXT,
    product_name TEXT,
    type TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    total_cost NUMERIC DEFAULT 0,
    total_revenue NUMERIC DEFAULT 0,
    profit NUMERIC DEFAULT 0,
    operator TEXT DEFAULT 'Admin',
    note TEXT DEFAULT '',
    image_url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS categories ( name TEXT PRIMARY KEY );
CREATE TABLE IF NOT EXISTS users ( username TEXT PRIMARY KEY, password TEXT NOT NULL, full_name TEXT, role TEXT DEFAULT 'staff', status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW() );

-- 2. Enable Row Level Security & Policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on products" ON products;
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on transactions" ON transactions;
CREATE POLICY "Allow all on transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on categories" ON categories;
CREATE POLICY "Allow all on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on users" ON users;
DROP POLICY IF EXISTS "Deny anon access to users" ON users;
CREATE POLICY "Deny anon access to users" ON users FOR ALL TO anon USING (false) WITH CHECK (false);

-- 3. Enable Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
END $$;

-- 4. Insert Categories
INSERT INTO categories (name) VALUES ('Art Toy / กล่องสุ่ม') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('Squishy / นุ่มนิ่ม') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('ของเล่นกระแส / สำเพ็ง') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('ของเล่นเสริมพัฒนาการ / DIY') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('การ์ด & ของสะสม') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('โมเดล & ฟิกเกอร์') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name) VALUES ('อื่นๆ') ON CONFLICT (name) DO NOTHING;

-- 5. Insert Users
INSERT INTO users (username, password, full_name, role, status, created_at) VALUES ('admin', 'admin1234', 'เจ้าของร้าน (Admin)', 'admin', 'active', '2026-09-01 02:09:24') ON CONFLICT (username) DO NOTHING;
INSERT INTO users (username, password, full_name, role, status, created_at) VALUES ('teppok', 'staff1234', 'พันพิชิต ศิลา', 'admin', 'active', '2026-09-02 09:43:10') ON CONFLICT (username) DO NOTHING;

-- 6. Insert Products (20 items)
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-002', 'Hachimi บังใหญ่ชม', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 186, 390, 204, 52.31, 40, 5, '2026-09-02 09:50:02') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-003', 'Hachimi Cake', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 96, 199, 103, 51.76, 29, 5, '2026-09-06 07:17:03') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-004', 'Mido คุกกี้', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 264, 350, 86, 24.57, 104, 5, '2026-09-06 07:20:46') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-005', 'Moozy หมูบิ๊กขาวดำ', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 430, 690, 260, 37.68, 3, 1, '2026-09-05 10:39:49') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-006', 'Lblduo Mummy', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 230, 390, 160, 41.03, 33, 5, '2026-09-02 08:51:23') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-007', 'Hachimi เปาใหญ่ขาว', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 220, 350, 130, 37.14, 18, 5, '2026-09-06 02:03:31') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-010', 'Mido โทสจมูกแดงBig', 'Art Toy / กล่องสุ่ม', 'ชิ้น', 1728, 1590, -138, -8.68, 4, 1, '2026-09-02 09:23:58') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-001', 'Hachimi บังใหญ่', 'ทั่วไป', 'ชิ้น', 189, 390, 201, 51.54, 40, 5, '2026-09-04 03:15:35') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-009', 'Hachimi เปาใหญ่ขาวเหลือง', 'Art Toy / กล่องสุ่ม', 'ชิ้น', 201, 350, 149, 42.57, 40, 5, '2026-09-02 09:32:26') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'Art Toy / กล่องสุ่ม', 'ชิ้น', 247.68, 390, 142.32, 36.49, 12, 5, '2026-09-06 07:19:47') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-012', 'Lisa กระต่ายหัวใจ', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 400, 690, 290, 42.03, 1, 5, '2026-09-05 05:38:09') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-013', 'Sweetbuns bunny', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 380, 590, 210, 35.59, 0, 1, '2026-09-05 10:47:43') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-014', 'Mido พริกหยวกจมด.เขียวแดง', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 310, 550, 240, 43.64, 0, 1, '2026-09-06 13:25:32') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-015', 'Lisa sakura mochi', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 330, 490, 160, 32.65, 0, 5, '2026-09-06 06:57:02') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-016', 'Lblduo กระต่าย', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 390, 690, 300, 43.48, 1, 5, '2026-09-06 01:53:32') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-017', 'Midoจมดโนริ', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 330, 590, 260, 44.07, 1, 1, '2026-09-06 01:56:37') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-018', 'Lisaเสื้อสกรีนกระต่ายชมพู', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 270, 450, 180, 40, 1, 1, '2026-09-06 02:00:36') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-019', 'Midoจมดคุกกี้ชม', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 300, 500, 200, 40, 1, 1, '2026-09-06 02:03:03') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-020', 'Hachimi อุ่งใหญ่ชมพู่', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 129, 290, 161, 55.52, 29, 5, '2026-09-06 06:00:25') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;
INSERT INTO products (product_id, product_name, category, unit, cost_price, sale_price, profit_per_unit, margin_percent, current_stock, min_alert, last_updated) VALUES ('TOY-021', 'สบู่กรอบ', 'Squishy / นุ่มนิ่ม', 'ชิ้น', 185, 290, 105, 36.21, 0, 1, '2026-09-06 11:33:51') ON CONFLICT (product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, cost_price=EXCLUDED.cost_price, sale_price=EXCLUDED.sale_price;

-- 7. Insert Transactions (48 items)
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788701085019-6249', '2026-09-06 13:24:45', 'TOY-014', 'Mido พริกหยวกจมด.เขียวแดง', 'OUT', 1, 310, 550, 310, 550, 240, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788694431031-4541', '2026-09-06 11:33:51', 'TOY-021', 'สบู่กรอบ', 'OUT', 1, 185, 290, 185, 290, 105, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788694417738-1117', '2026-09-06 11:33:37', 'TOY-021', 'สบู่กรอบ', 'IN', 1, 185, 290, 185, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788679246994-6247', '2026-09-06 07:20:46', 'TOY-004', 'Mido คุกกี้', 'OUT', 1, 264, 350, 264, 350, 86, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788679187357-6535', '2026-09-06 07:19:47', 'TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'OUT', 1, 247.68, 390, 247.68, 390, 142.32, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788679023168-8372', '2026-09-06 07:17:03', 'TOY-003', 'Hachimi Cake', 'OUT', 1, 96, 199, 96, 199, 103, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788677822622-5423', '2026-09-06 06:57:02', 'TOY-015', 'Lisa sakura mochi', 'OUT', 1, 330, 490, 330, 490, 160, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788674425350-6621', '2026-09-06 06:00:25', 'TOY-020', 'Hachimi อุ่งใหญ่ชมพู่', 'OUT', 1, 129, 290, 129, 290, 161, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788664609871-1885', '2026-09-06 03:16:49', 'TOY-020', 'Hachimi อุ่งใหญ่ชมพู่', 'IN', 30, 129, 290, 3870, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788660211813-9413', '2026-09-06 02:03:31', 'TOY-007', 'Hachimi เปาใหญ่ขาว', 'OUT', 1, 220, 350, 220, 350, 130, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788660189491-1834', '2026-09-06 02:03:09', 'TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'OUT', 1, 247.68, 390, 247.68, 390, 142.32, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-183676', '2026-09-06 02:03:03', 'TOY-019', 'Midoจมดคุกกี้ชม', 'IN', 1, 300, 500, 300, 0, 0, 'Admin', 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-037029', '2026-09-06 02:00:37', 'TOY-018', 'Lisaเสื้อสกรีนกระต่ายชมพู', 'IN', 1, 270, 450, 270, 0, 0, 'Admin', 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-723830', '2026-09-06 01:55:23', 'TOY-017', 'Midoจมดโนริ', 'IN', 1, 330, 690, 330, 0, 0, 'Admin', 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788659612942-7917', '2026-09-06 01:53:32', 'TOY-016', 'Lblduo กระต่าย', 'IN', 1, 390, 690, 390, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788659469138-8886', '2026-09-06 01:51:09', 'TOY-015', 'Lisa sakura mochi', 'IN', 1, 330, 490, 330, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-757375', '2026-09-05 11:45:57', 'TOY-014', 'Mido พริกหยวกจมด.เขียวแดง', 'IN', 1, 310, 550, 310, 0, 0, 'Admin', 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788605263970-8265', '2026-09-05 10:47:43', 'TOY-013', 'Sweetbuns bunny', 'OUT', 1, 380, 590, 380, 590, 210, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788605244699-6481', '2026-09-05 10:47:24', 'TOY-013', 'Sweetbuns bunny', 'IN', 1, 380, 590, 380, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788604789239-5607', '2026-09-05 10:39:49', 'TOY-005', 'Moozy หมูบิ๊กขาวดำ', 'OUT', 1, 430, 690, 430, 690, 260, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788604693663-1524', '2026-09-05 10:38:13', 'TOY-005', 'Moozy หมูบิ๊กขาวดำ', 'IN', 1, 430, 690, 430, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788586689480-4296', '2026-09-05 05:38:09', 'TOY-012', 'Lisa กระต่ายหัวใจ', 'IN', 1, 400, 690, 400, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788581247462-8665', '2026-09-05 04:07:27', 'TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'OUT', 1, 247.68, 390, 247.68, 390, 142.32, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788581224554-5648', '2026-09-05 04:07:04', 'TOY-004', 'Mido คุกกี้', 'OUT', 1, 264, 350, 264, 350, 86, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788529237512-1287', '2026-09-04 13:40:37', 'TOY-012', 'Mido กุ้งเทมปุระ', 'OUT', 1, 387, 490, 387, 490, 103, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788529207435-7057', '2026-09-04 13:40:07', 'TOY-012', 'Mido กุ้งเทมปุระ', 'IN', 10, 387, 490, 3870, 0, 0, 'พันพิชิต ศิลา', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788513272479-1303', '2026-09-04 09:14:32', 'TOY-004', 'Mido คุกกี้', 'OUT', 1, 264, 350, 264, 350, 86, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788489744022-2071', '2026-09-04 02:42:24', 'TOY-001', 'Hachimi บังใหญ่', 'ADJUST', 10, 186, 390, 0, 0, 0, 'Admin', 'ทดสอบนับสต็อก', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788489320235-6502', '2026-09-04 02:35:20', 'TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'OUT', 1, 247.68, 360, 247.68, 360, 112.32, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788489264213-5719', '2026-09-04 02:34:24', 'TOY-011', 'Miniso Monchhichi เปลี่ยนหน้า', 'IN', 16, 247.68, 390, 3962.88, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788488393620-1445', '2026-09-04 02:19:53', 'TOY-004', 'Mido คุกกี้', 'OUT', 1, 264, 325, 264, 325, 61, 'Admin', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788488326048-3234', '2026-09-04 02:18:46', 'TOY-004', 'Mido คุกกี้', 'OUT', 1, 264, 325, 264, 325, 61, 'Admin', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788341546801-9753', '2026-09-02 09:32:26', 'TOY-009', 'Hachimi เปาใหญ่ขาวเหลือง', 'IN', 10, 201, 350, 2010, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788341281517-1855', '2026-09-02 09:28:01', 'TOY-009', 'Hachimi เปาใหญ่ขาวเหลือง', 'IN', 10, 201, 350, 2010, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788341022559-1885', '2026-09-02 09:23:42', 'TOY-010', 'Mido โทสจมูกแดงBig', 'IN', 4, 1728, 1590, 6912, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788339083005-3805', '2026-09-02 08:51:23', 'TOY-006', 'Lblduo Mummy', 'OUT', 2, 230, 390, 460, 780, 320, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788339061021-7399', '2026-09-02 08:51:01', 'TOY-007', 'Hachimi เปาใหญ่ขาว', 'OUT', 1, 220, 350, 220, 350, 130, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788338867749-7115', '2026-09-02 08:47:47', 'TOY-008', 'hachimi เปาใหญ่เหลือง', 'IN', 10, 201, 350, 2010, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788338347993-8538', '2026-09-02 08:39:07', 'TOY-006', 'Lblduo Mummy', 'IN', 5, 230, 390, 1150, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788338266779-5323', '2026-09-02 08:37:46', 'TOY-007', 'Hachimi เปาใหญ่ขาว', 'IN', 20, 220, 350, 4400, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788337935118-4810', '2026-09-02 08:32:15', 'TOY-006', 'Lblduo Mummy', 'IN', 30, 240, 390, 7200, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788244347552-3734', '2026-09-01 06:32:27', 'TOY-005', 'Moozy หมูบิ๊ก', 'IN', 3, 430, 690, 1290, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788244204899-8670', '2026-09-01 06:30:04', 'TOY-004', 'Mido คุกกี้', 'IN', 110, 264, 350, 29040, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788243651672-5818', '2026-09-01 06:20:51', 'TOY-003', 'Hachimi Cake', 'IN', 30, 96, 199, 2880, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788243407678-7967', '2026-09-01 06:16:47', 'TOY-002', 'Hachimi บังใหญ่ชม', 'IN', 40, 186, 350, 7440, 0, 0, 'เจ้าของร้าน (Admin)', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788243251201-7422', '2026-09-01 06:14:11', 'TOY-002', 'Hachimi บังใหญ่ชม', 'IN', 40, 186, 350, 7440, 0, 0, 'Admin', '', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-224301', '2026-09-01 06:13:44', 'TOY-002', 'Hachimi บังใหญ่ชม', 'IN', 40, 186, 350, 7440, 0, 0, 'Admin', 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น', '') ON CONFLICT (trans_id) DO NOTHING;
INSERT INTO transactions (trans_id, timestamp, product_id, product_name, type, quantity, cost_price, sale_price, total_cost, total_revenue, profit, operator, note, image_url) VALUES ('TRX-1788243119307-2420', '2026-09-01 06:11:59', 'TOY-009', 'Hachimi บังใหญ่', 'IN', 40, 186, 350, 7440, 0, 0, 'Admin', '', '') ON CONFLICT (trans_id) DO NOTHING;

-- 8. Sequence for Auto Product ID
CREATE SEQUENCE IF NOT EXISTS seq_product_toy_id START WITH 22;

CREATE OR REPLACE FUNCTION get_next_product_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    next_val BIGINT;
    next_id TEXT;
    candidate_num BIGINT;
    max_num BIGINT := 0;
    r RECORD;
BEGIN
    FOR r IN SELECT product_id FROM products WHERE product_id ~* '^TOY-[0-9]+$' LOOP
        candidate_num := CAST(SUBSTRING(r.product_id FROM 5) AS BIGINT);
        IF candidate_num > max_num THEN
            max_num := candidate_num;
        END IF;
    END LOOP;

    PERFORM setval('seq_product_toy_id', GREATEST(max_num, 21), true);

    next_val := nextval('seq_product_toy_id');
    next_id := 'TOY-' || LPAD(next_val::TEXT, 3, '0');
    
    RETURN next_id;
END;
$func$;

CREATE OR REPLACE FUNCTION mute_product_alert(p_product_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_updated INT;
BEGIN
    UPDATE products
    SET min_alert = -1,
        last_updated = NOW()
    WHERE product_id = p_product_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'ปิดการแจ้งเตือนสำเร็จ');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'ไม่พบรหัสสินค้า ' || p_product_id);
    END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION execute_stock_transaction(
    p_product_id TEXT,
    p_type TEXT,
    p_quantity NUMERIC,
    p_price NUMERIC,
    p_operator TEXT,
    p_note TEXT DEFAULT '',
    p_image_url TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_product RECORD;
    v_trans_id TEXT;
    v_old_stock NUMERIC;
    v_old_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_revenue NUMERIC := 0;
    v_cost NUMERIC := 0;
    v_profit NUMERIC := 0;
    v_sale_price NUMERIC;
    v_cost_price NUMERIC;
BEGIN
    SELECT * INTO v_product FROM products WHERE product_id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบสินค้า %', p_product_id;
    END IF;

    v_old_stock := COALESCE(v_product.current_stock, 0);
    v_old_cost := COALESCE(v_product.cost_price, 0);

    IF p_type = 'OUT' THEN
        IF v_old_stock < p_quantity THEN
            RAISE EXCEPTION 'สต็อกไม่พอ! คงเหลือ % ชิ้น (ต้องการตัด % ชิ้น)', v_old_stock, p_quantity;
        END IF;

        v_new_stock := v_old_stock - p_quantity;
        v_new_cost := v_old_cost;
        v_sale_price := COALESCE(p_price, v_product.sale_price, 0);
        v_cost_price := v_old_cost;
        v_revenue := p_quantity * v_sale_price;
        v_cost := p_quantity * v_cost_price;
        v_profit := v_revenue - v_cost;

    ELSIF p_type = 'IN' THEN
        v_new_stock := v_old_stock + p_quantity;
        v_cost_price := COALESCE(p_price, v_old_cost);
        v_sale_price := COALESCE(v_product.sale_price, 0);
        v_revenue := 0;
        v_cost := p_quantity * v_cost_price;
        v_profit := 0;

        IF v_old_stock <= 0 THEN
            v_new_cost := v_cost_price;
        ELSE
            v_new_cost := ROUND(((v_old_stock * v_old_cost) + (p_quantity * v_cost_price)) / v_new_stock, 2);
        END IF;

    ELSE -- ADJUST
        v_new_stock := p_quantity;
        v_new_cost := v_old_cost;
        v_cost_price := v_old_cost;
        v_sale_price := COALESCE(v_product.sale_price, 0);
        v_revenue := 0;
        v_cost := 0;
        v_profit := 0;
    END IF;

    UPDATE products
    SET current_stock = v_new_stock,
        cost_price = v_new_cost,
        profit_per_unit = ROUND(sale_price - v_new_cost, 2),
        margin_percent = CASE WHEN sale_price > 0 THEN ROUND(((sale_price - v_new_cost) / sale_price) * 100, 2) ELSE 0 END,
        last_updated = NOW()
    WHERE product_id = p_product_id;

    v_trans_id := 'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS-') || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

    INSERT INTO transactions (
        trans_id, timestamp, product_id, product_name, type, quantity,
        cost_price, sale_price, total_cost, total_revenue, profit,
        operator, note, image_url
    ) VALUES (
        v_trans_id, NOW(), p_product_id, v_product.product_name, p_type, p_quantity,
        v_cost_price, v_sale_price, v_cost, v_revenue, v_profit,
        COALESCE(p_operator, 'Staff'), COALESCE(p_note, ''), COALESCE(p_image_url, '')
    );

    RETURN jsonb_build_object(
        'success', true,
        'transId', v_trans_id,
        'newStock', v_new_stock,
        'newCost', v_new_cost,
        'profit', v_profit
    );
END;
$func$;

-- 9. มุมมองข้อมูลสำหรับ Staff
CREATE OR REPLACE VIEW staff_products AS
SELECT
    product_id,
    product_name,
    category,
    unit,
    sale_price,
    current_stock,
    min_alert,
    last_updated
FROM products;

-- 10. Security Extensions & Server-side Authentication
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION login_user(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_user RECORD;
    v_is_valid BOOLEAN := false;
BEGIN
    SELECT username, password, full_name, role, status
    INTO v_user
    FROM users
    WHERE LOWER(username) = LOWER(TRIM(p_username));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    END IF;

    IF v_user.status = 'inactive' THEN
        RETURN jsonb_build_object('success', false, 'message', 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน');
    END IF;

    IF v_user.password = crypt(p_password, v_user.password) THEN
        v_is_valid := true;
    ELSIF v_user.password = p_password THEN
        v_is_valid := true;
        UPDATE users
        SET password = crypt(p_password, gen_salt('bf', 10))
        WHERE username = v_user.username;
    END IF;

    IF v_is_valid THEN
        RETURN jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'username', v_user.username,
                'fullName', COALESCE(v_user.full_name, v_user.username),
                'role', COALESCE(v_user.role, 'staff')
            )
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    END IF;
END;
$func$;

-- 11. สิทธิ์การเข้าถึงสำหรับ anon และ authenticated
GRANT SELECT ON staff_products TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_next_product_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mute_product_alert(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_stock_transaction(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION login_user(TEXT, TEXT) TO anon, authenticated;
