-- =========================================================================
-- LEBON TOY STOCK HUB - SUPABASE SQL PATCH 2.0 (OPTIMIZED & CONCURRENCY-SAFE)
-- รันไฟล์นี้ใน Supabase SQL Editor (ครั้งเดียว) เพื่อเพิ่มประสิทธิภาพและความปลอดภัยสูงสุด
-- =========================================================================

-- 0. เพิ่มคอลัมน์หมายเหตุสำหรับตารางสินค้า (ถ้ายังไม่มี)
ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- 1. สร้าง Sequence สำหรับรหัสสินค้า TOY-xxx ป้องกันรหัสสินค้าซ้ำจากการกดพร้อมกัน
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
    -- ค้นหาเลขสูงสุดปัจจุบันจากรหัส TOY-xxx ในตาราง products
    FOR r IN SELECT product_id FROM products WHERE product_id ~* '^TOY-[0-9]+$' LOOP
        candidate_num := CAST(SUBSTRING(r.product_id FROM 5) AS BIGINT);
        IF candidate_num > max_num THEN
            max_num := candidate_num;
        END IF;
    END LOOP;

    -- ปรับ Sequence ให้ไม่ต่ำกว่าเลขสูงสุดที่มีอยู่
    PERFORM setval('seq_product_toy_id', GREATEST(max_num, 21), true);

    next_val := nextval('seq_product_toy_id');
    next_id := 'TOY-' || LPAD(next_val::TEXT, 3, '0');
    
    RETURN next_id;
END;
$func$;

-- 2. ฟังก์ชันปิดการแจ้งเตือนแบบปลอดภัย (แก้ไข BUG-01: ไม่ลบหรือทับต้นทุนสินค้า)
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

-- 3. Stored Procedure ตัดสต็อก / รับเข้า แบบ Atomic Transction พร้อมคำนวณ WAC (MATH-01)
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
    -- ล็อกแถวสินค้าเพื่อป้องกัน Race Condition / ตัดสต็อกซ้อน
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
        v_new_cost := v_old_cost; -- ต้นทุนไม่เปลี่ยนตอนขายออก
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

        -- คำนวณ Weighted Average Cost (WAC) - รองรับต้นทุน 0 บาท (ของแถมโปรโมชั่น)
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

    -- อัปเดตสินค้า
    UPDATE products
    SET current_stock = v_new_stock,
        cost_price = v_new_cost,
        profit_per_unit = ROUND(sale_price - v_new_cost, 2),
        margin_percent = CASE WHEN sale_price > 0 THEN ROUND(((sale_price - v_new_cost) / sale_price) * 100, 2) ELSE 0 END,
        last_updated = NOW()
    WHERE product_id = p_product_id;

    -- บันทึกประวัติ Transaction
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

-- 4. มุมมองข้อมูลสำหรับ Staff (ซ่อนต้นทุนและกำไรเพื่อความปลอดภัยตามสิทธิ์)
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

-- 5. ส่วนขยายความปลอดภัยและการแฮชรหัสผ่าน
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 6. ระบบยืนยันตัวตนแบบปลอดภัย (Server-side Authentication with Bcrypt/Crypto)
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

    -- ตรวจสอบรหัสผ่าน: รองรับทั้ง hash (crypt) และ fallback plaintext พร้อม auto-upgrade
    IF v_user.password = crypt(p_password, v_user.password) THEN
        v_is_valid := true;
    ELSIF v_user.password = p_password THEN
        v_is_valid := true;
        -- อัปเกรดเป็น bcrypt hash อัตโนมัติในฐานข้อมูล
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

-- 7. ปิดกั้นตาราง users จากการเข้าถึงโดยตรงของ anon (Deny direct access to users table)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on users" ON users;
DROP POLICY IF EXISTS "Deny anon access to users" ON users;
CREATE POLICY "Deny anon access to users" ON users FOR ALL TO anon USING (false) WITH CHECK (false);

-- 8. สิทธิ์การเข้าถึง View และ Function สำหรับ anon
GRANT SELECT ON staff_products TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_next_product_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mute_product_alert(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION execute_stock_transaction(TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION login_user(TEXT, TEXT) TO anon, authenticated;
