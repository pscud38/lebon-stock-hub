-- =========================================================================
-- LEBON TOY - SUPABASE SUPPLIER PRE-ORDERS SCHEMA (ระบบสั่งของร้านขายส่ง & รอของเข้า)
-- =========================================================================

-- 1. สร้างหรือปรับปรุงตาราง preorders
CREATE TABLE IF NOT EXISTS preorders (
    preorder_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    supplier_name TEXT NOT NULL DEFAULT '',
    supplier_contact TEXT DEFAULT '',
    product_id TEXT DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    category TEXT DEFAULT 'Art Toy / กล่องสุ่ม',
    quantity NUMERIC DEFAULT 1,
    cost_price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    deposit_amount NUMERIC DEFAULT 0,
    remaining_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'WAITING_ARRIVAL', -- 'WAITING_ARRIVAL', 'ARRIVED', 'STOCKED', 'CANCELLED'
    expected_date TEXT DEFAULT '',
    tracking_no TEXT DEFAULT '',
    operator TEXT DEFAULT 'Admin',
    note TEXT DEFAULT '',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- อัปเกรดคอลัมน์อัตโนมัติหากมีตารางเดิมอยู่แล้ว
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='supplier_name') THEN
    ALTER TABLE preorders ADD COLUMN supplier_name TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='supplier_contact') THEN
    ALTER TABLE preorders ADD COLUMN supplier_contact TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='cost_price') THEN
    ALTER TABLE preorders ADD COLUMN cost_price NUMERIC DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='category') THEN
    ALTER TABLE preorders ADD COLUMN category TEXT DEFAULT 'Art Toy / กล่องสุ่ม';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='tracking_no') THEN
    ALTER TABLE preorders ADD COLUMN tracking_no TEXT DEFAULT '';
  END IF;
  -- หากมีข้อมูลเก่าจาก customer_name ให้ย้ายมา supplier_name อัตโนมัติ
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preorders' AND column_name='customer_name') THEN
    UPDATE preorders SET supplier_name = customer_name WHERE (supplier_name IS NULL OR supplier_name = '') AND customer_name IS NOT NULL;
  END IF;
END $$;

-- 2. เปิดใช้งาน Row Level Security (RLS)
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on preorders" ON preorders;
CREATE POLICY "Allow all on preorders" ON preorders FOR ALL USING (true) WITH CHECK (true);

-- 3. เปิดใช้งาน Realtime Replication เพื่อให้หน้าจออัปเดตข้ามอุปกรณ์อัตโนมัติ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'preorders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE preorders;
  END IF;
END $$;
