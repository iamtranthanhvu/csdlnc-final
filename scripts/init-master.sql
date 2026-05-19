-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE users (
    user_id    SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(150) UNIQUE NOT NULL,
    phone      VARCHAR(20),
    password   VARCHAR(255) NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(role_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE vendors (
    vendor_id         SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    email             VARCHAR(150),
    warehouse_address TEXT,
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory (
    vendor_id      INT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    product_id     INT NOT NULL,
    price          NUMERIC(15,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved       INT NOT NULL DEFAULT 0,
    status         VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'out_of_stock', 'inactive')),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (vendor_id, product_id)
);

CREATE TABLE orders (
    order_id       SERIAL PRIMARY KEY,
    customer_id    INT REFERENCES users(user_id),
    status         VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'failed', 'cancelled')),
    total_price    NUMERIC(15,2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
    order_id      INT REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id    INT NOT NULL,
    vendor_id     INT REFERENCES vendors(vendor_id),
    quantity      INT NOT NULL CHECK (quantity > 0),
    price_at_time NUMERIC(15,2) NOT NULL,
    PRIMARY KEY (order_id, product_id, vendor_id)
);

CREATE TABLE sub_orders (
    sub_order_id SERIAL PRIMARY KEY,
    order_id     INT REFERENCES orders(order_id) ON DELETE CASCADE,
    vendor_id    INT REFERENCES vendors(vendor_id),
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'failed')),
    subtotal     NUMERIC(15,2) NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE price_history (
    history_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    vendor_id  INT REFERENCES vendors(vendor_id),
    old_price  NUMERIC(15,2) NOT NULL,
    new_price  NUMERIC(15,2) NOT NULL,
    changed_by INT REFERENCES users(user_id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_orders_customer       ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_order_items_product   ON order_items(product_id);
CREATE INDEX idx_price_history_product ON price_history(product_id, changed_at DESC);
CREATE INDEX idx_inventory_product     ON inventory(product_id);

-- ============================================================
-- Functions & Triggers
-- ============================================================

-- Kịch bản 1 & 2: trừ tồn kho khi order chuyển từ pending → confirmed
CREATE OR REPLACE FUNCTION fn_deduct_inventory()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        UPDATE inventory i
        SET stock_quantity = stock_quantity - oi.quantity,
            updated_at     = NOW()
        FROM order_items oi
        WHERE oi.order_id  = NEW.order_id
          AND i.vendor_id  = oi.vendor_id
          AND i.product_id = oi.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_deduct_inventory
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_deduct_inventory();

-- Kịch bản 5: cập nhật giá và ghi audit log
CREATE OR REPLACE FUNCTION fn_update_product_price(
    p_product_id INT,
    p_vendor_id  INT,
    p_new_price  NUMERIC,
    p_changed_by INT
) RETURNS VOID AS $$
DECLARE
    v_old_price NUMERIC;
BEGIN
    SELECT price INTO v_old_price
    FROM inventory
    WHERE vendor_id = p_vendor_id AND product_id = p_product_id;

    INSERT INTO price_history (product_id, vendor_id, old_price, new_price, changed_by)
    VALUES (p_product_id, p_vendor_id, COALESCE(v_old_price, 0), p_new_price, p_changed_by);

    UPDATE inventory
    SET price      = p_new_price,
        updated_at = NOW()
    WHERE vendor_id = p_vendor_id AND product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- Kịch bản 6: báo cáo doanh thu tháng dùng Cursor
CREATE OR REPLACE FUNCTION fn_monthly_vendor_commission(
    p_year  INT,
    p_month INT
) RETURNS TABLE(vendor_id INT, vendor_name VARCHAR(150), total_revenue NUMERIC) AS $$
DECLARE
    cur CURSOR FOR
        SELECT v.vendor_id, v.name,
               SUM(oi.quantity * oi.price_at_time) AS revenue
        FROM sub_orders so
        JOIN orders o      ON o.order_id  = so.order_id
        JOIN vendors v     ON v.vendor_id = so.vendor_id
        JOIN order_items oi ON oi.order_id = o.order_id
                           AND oi.vendor_id = so.vendor_id
        WHERE o.status = 'completed'
          AND EXTRACT(YEAR  FROM o.created_at) = p_year
          AND EXTRACT(MONTH FROM o.created_at) = p_month
        GROUP BY v.vendor_id, v.name;
    rec RECORD;
BEGIN
    OPEN cur;
    LOOP
        FETCH cur INTO rec;
        EXIT WHEN NOT FOUND;
        vendor_id     := rec.vendor_id;
        vendor_name   := rec.name;
        total_revenue := rec.revenue;
        RETURN NEXT;
    END LOOP;
    CLOSE cur;
END;
$$ LANGUAGE plpgsql;

-- Kịch bản 7: kiểm tra tồn kho thấp dùng Cursor
CREATE OR REPLACE FUNCTION fn_check_low_stock(p_threshold INT)
RETURNS TABLE(vendor_id INT, product_id INT, stock_quantity INT, status VARCHAR(20)) AS $$
DECLARE
    cur CURSOR FOR
        SELECT i.vendor_id, i.product_id, i.stock_quantity, i.status
        FROM inventory i
        WHERE i.stock_quantity <= p_threshold
          AND i.status = 'active'
        ORDER BY i.stock_quantity ASC;
    rec RECORD;
BEGIN
    OPEN cur;
    LOOP
        FETCH cur INTO rec;
        EXIT WHEN NOT FOUND;
        vendor_id     := rec.vendor_id;
        product_id    := rec.product_id;
        stock_quantity := rec.stock_quantity;
        status        := rec.status;
        RETURN NEXT;
    END LOOP;
    CLOSE cur;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Views
-- ============================================================

CREATE VIEW vw_admin_orders AS
SELECT o.*, u.name AS customer_name, u.email AS customer_email
FROM orders o
JOIN users u ON u.user_id = o.customer_id;

-- ============================================================
-- Seed Data
-- Passwords (tất cả users): Secret@123
-- ============================================================

INSERT INTO roles (role_name, description) VALUES
  ('admin',    'Quản trị viên hệ thống'),
  ('customer', 'Khách hàng');

INSERT INTO users (name, email, phone, password) VALUES
  ('Nguyễn Văn An',  'admin@techshop.vn',   '0909111000', crypt('Secret@123', gen_salt('bf', 10))),
  ('Lê Ngọc An',     'anle@gmail.com',        '0912222333', crypt('Secret@123', gen_salt('bf', 10))),
  ('Vũ Trần',        'vu.tran@yahoo.com',     '0988777666', crypt('Secret@123', gen_salt('bf', 10))),
  ('Phạm Minh Quân', 'quan.pham@gmail.com',   '0977123456', crypt('Secret@123', gen_salt('bf', 10))),
  ('Trần Thị Lan',   'lan.tran@hotmail.com',  '0966543210', crypt('Secret@123', gen_salt('bf', 10)));

INSERT INTO user_roles (user_id, role_id) VALUES
  (1, 1),  -- admin@techshop.vn → admin
  (2, 2),  -- anle → customer
  (3, 2),
  (4, 2),
  (5, 2);

INSERT INTO vendors (name, email, warehouse_address) VALUES
  ('GearVN Store', 'order@gearvn.com',     '123 Hoàng Hoa Thám, Tân Bình, HCM'),
  ('ThinkPro',     'order@thinkpro.vn',    '50 Nguyễn Văn Huyên, Cầu Giấy, HN'),
  ('Cellphones S', 'order@cellphones.com', '75 Bạch Đằng, Bình Thạnh, HCM');

-- product_id tham chiếu sang MongoDB collection products
INSERT INTO inventory (vendor_id, product_id, price, stock_quantity) VALUES
  (1, 2001, 45000000, 15),   -- GearVN: Dell XPS 15
  (1, 2002, 32000000, 30),   -- GearVN: iPhone 15 Pro Max
  (1, 2006, 45000000, 12),   -- GearVN: Fujifilm X-T5
  (2, 2001, 45500000, 10),   -- ThinkPro: Dell XPS 15
  (2, 2003, 52000000,  8),   -- ThinkPro: Sony A7 IV
  (2, 2004, 49000000, 20),   -- ThinkPro: MacBook Pro 14
  (3, 2002, 31500000, 25),   -- Cellphones S: iPhone 15 Pro Max
  (3, 2005, 30000000,  5);   -- Cellphones S: Samsung Galaxy S24 Ultra

-- Sample orders (demo data)
INSERT INTO orders (customer_id, status, total_price, payment_status) VALUES
  (2, 'completed', 45000000, 'paid'),    -- order_id = 1
  (3, 'shipping',  32000000, 'paid'),    -- order_id = 2
  (2, 'pending',   97000000, 'unpaid'); -- order_id = 3 (multi-vendor)

INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price_at_time) VALUES
  (1, 2001, 1, 1, 45000000),
  (2, 2002, 1, 1, 32000000),
  (3, 2001, 1, 1, 45000000),
  (3, 2003, 2, 1, 52000000);

INSERT INTO sub_orders (order_id, vendor_id, status, subtotal) VALUES
  (1, 1, 'completed', 45000000),
  (2, 1, 'shipping',  32000000),
  (3, 1, 'pending',   45000000),
  (3, 2, 'pending',   52000000);
