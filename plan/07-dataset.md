# Dataset mẫu

## PostgreSQL Seed Data

### Roles
```sql
INSERT INTO roles (role_name, description) VALUES
  ('admin',    'Quản trị viên hệ thống'),
  ('customer', 'Khách hàng');
```

### Users
```sql
INSERT INTO users (name, email, phone, password) VALUES
  ('Nguyễn Văn An',  'admin@techshop.vn',    '0909111000', '$2b$10$...'),  -- admin
  ('Lê Ngọc An',     'anle@gmail.com',         '0912222333', '$2b$10$...'),  -- customer
  ('Vũ Trần',        'vu.tran@yahoo.com',      '0988777666', '$2b$10$...'),  -- customer
  ('Phạm Minh Quân', 'quan.pham@gmail.com',    '0977123456', '$2b$10$...'),  -- customer
  ('Trần Thị Lan',   'lan.tran@hotmail.com',   '0966543210', '$2b$10$...');  -- customer
```

### User Roles
```sql
INSERT INTO user_roles (user_id, role_id) VALUES
  (1, 1),  -- admin
  (2, 2),  -- customer
  (3, 2),
  (4, 2),
  (5, 2);
```

### Vendors
```sql
INSERT INTO vendors (name, warehouse_address) VALUES
  ('GearVN Store', '123 Hoàng Hoa Thám, Tân Bình, HCM'),
  ('ThinkPro',     '50 Nguyễn Văn Huyên, Cầu Giấy, HN'),
  ('Cellphones S', '75 Bạch Đằng, Bình Thạnh, HCM');
```

### Inventory
```sql
INSERT INTO inventory (product_id, stock_quantity) VALUES
  (2001, 15),  -- Dell XPS 15
  (2002, 30),  -- iPhone 15 Pro Max
  (2003, 8),   -- Sony A7 IV
  (2004, 20),  -- MacBook Pro 14
  (2005, 5),   -- Samsung Galaxy S24 Ultra
  (2006, 12);  -- Fujifilm X-T5
```

### Vendor Products
```sql
INSERT INTO vendor_products (vendor_id, product_id, status) VALUES
  (1, 2001, 'active'),   -- GearVN có Dell XPS
  (1, 2002, 'active'),   -- GearVN có iPhone
  (2, 2001, 'active'),   -- ThinkPro cũng có Dell XPS
  (2, 2003, 'active'),   -- ThinkPro có Sony A7
  (2, 2004, 'active'),   -- ThinkPro có MacBook
  (3, 2002, 'active'),   -- Cellphones S có iPhone
  (3, 2005, 'active'),   -- Cellphones S có Samsung
  (1, 2006, 'active');   -- GearVN có Fujifilm
```

### Price History (initial prices)
```sql
INSERT INTO price_history (product_id, vendor_id, old_price, new_price, changed_by) VALUES
  (2001, 1, 48000000, 45000000, 1),  -- Dell XPS giảm từ 48M → 45M
  (2002, 1, 35000000, 32000000, 1),  -- iPhone giảm từ 35M → 32M
  (2003, 2, 55000000, 52000000, 1),  -- Sony giảm từ 55M → 52M
  (2004, 2, 52000000, 49000000, 1),  -- MacBook giảm
  (2005, 3, 32000000, 30000000, 1);  -- Samsung giảm
```

### Orders & Order Details
```sql
-- Order 1001: Completed
INSERT INTO orders (customer_id, status, total_price, payment_status) VALUES
  (2, 'completed', 45000000, 'paid');

INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price_at_time) VALUES
  (1, 2001, 1, 1, 45000000);

INSERT INTO sub_orders (order_id, vendor_id, status, subtotal) VALUES
  (1, 1, 'completed', 45000000);

-- Order 1002: Shipping
INSERT INTO orders (customer_id, status, total_price, payment_status) VALUES
  (3, 'shipping', 32000000, 'paid');

INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price_at_time) VALUES
  (2, 2002, 1, 1, 32000000);

-- Order 1003: Multi-vendor (Pending)
INSERT INTO orders (customer_id, status, total_price, payment_status) VALUES
  (2, 'pending', 97000000, 'unpaid');

INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price_at_time) VALUES
  (3, 2001, 1, 1, 45000000),
  (3, 2003, 2, 1, 52000000);

INSERT INTO sub_orders (order_id, vendor_id, status, subtotal) VALUES
  (3, 1, 'pending', 45000000),
  (3, 2, 'pending', 52000000);
```

---

## MongoDB Seed Data

### Collection: `products`

```javascript
db.products.insertMany([
  {
    _id: 2001,
    name: "Dell XPS 15 9530",
    category: "Laptop",
    brand: "Dell",
    images: [
      "https://cdn.example.com/dell-xps15-1.jpg",
      "https://cdn.example.com/dell-xps15-2.jpg"
    ],
    stock_quantity: 15,
    specs: {
      cpu: "Intel Core i9-13900H",
      ram: "32GB DDR5",
      ssd: "1TB NVMe PCIe 4.0",
      gpu: "NVIDIA GeForce RTX 4060 8GB",
      screen: "15.6 inch OLED 3.5K 60Hz",
      battery: "86Wh",
      weight: "1.86kg",
      os: "Windows 11 Home"
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  },
  {
    _id: 2002,
    name: "iPhone 15 Pro Max",
    category: "Smartphone",
    brand: "Apple",
    images: [
      "https://cdn.example.com/iphone15pm-1.jpg"
    ],
    stock_quantity: 30,
    specs: {
      chipset: "Apple A17 Pro",
      screen: "6.7 inch Super Retina XDR OLED",
      battery: "4422mAh",
      camera: "48MP Main + 12MP Ultra Wide + 12MP 5x Telephoto",
      storage_options: ["256GB", "512GB", "1TB"],
      os: "iOS 17",
      weight: "221g",
      material: "Titanium"
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  },
  {
    _id: 2003,
    name: "Sony Alpha A7 IV",
    category: "Camera",
    brand: "Sony",
    images: [
      "https://cdn.example.com/sony-a7iv-1.jpg"
    ],
    stock_quantity: 8,
    specs: {
      sensor: "33MP Full-Frame BSI CMOS",
      iso: "100-51200 (expandable 50-204800)",
      autofocus: "759-point phase-detect AF",
      video: "4K 60p / FHD 120p",
      mount: "Sony E-mount",
      stabilization: "5-axis in-body",
      weight: "659g",
      weather_sealed: true
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  },
  {
    _id: 2004,
    name: "MacBook Pro 14 M3 Pro",
    category: "Laptop",
    brand: "Apple",
    images: [
      "https://cdn.example.com/mbp14-1.jpg"
    ],
    stock_quantity: 20,
    specs: {
      chip: "Apple M3 Pro (11-core CPU, 14-core GPU)",
      ram: "18GB Unified Memory",
      ssd: "512GB SSD",
      screen: "14.2 inch Liquid Retina XDR 120Hz",
      battery: "70Wh (up to 18h)",
      weight: "1.61kg",
      ports: ["3x Thunderbolt 4", "HDMI", "SD card", "MagSafe 3"],
      os: "macOS Sonoma"
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  },
  {
    _id: 2005,
    name: "Samsung Galaxy S24 Ultra",
    category: "Smartphone",
    brand: "Samsung",
    images: [
      "https://cdn.example.com/s24ultra-1.jpg"
    ],
    stock_quantity: 5,
    specs: {
      chipset: "Snapdragon 8 Gen 3",
      screen: "6.8 inch Dynamic AMOLED 2X 120Hz",
      battery: "5000mAh",
      camera: "200MP Main + 12MP Ultra Wide + 10MP 3x + 50MP 5x",
      storage: "256GB / 512GB / 1TB",
      stylus: "S Pen included",
      os: "Android 14 (One UI 6.1)",
      weight: "232g"
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  },
  {
    _id: 2006,
    name: "Fujifilm X-T5",
    category: "Camera",
    brand: "Fujifilm",
    images: [
      "https://cdn.example.com/xt5-1.jpg"
    ],
    stock_quantity: 12,
    specs: {
      sensor: "40.2MP APS-C X-Trans CMOS 5 HR",
      iso: "125-12800 (expandable 64-51200)",
      autofocus: "Subject detection AF",
      video: "6.2K 30p / 4K 60p",
      mount: "Fujifilm X-mount",
      film_simulations: 20,
      weight: "557g",
      weather_sealed: true
    },
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01")
  }
]);
```

---

## Tổng kết dataset

| Loại dữ liệu | Số lượng |
|---|---|
| Users | 5 (1 admin, 4 customers) |
| Vendors | 3 |
| Products | 6 (3 Laptop, 2 Smartphone, ... oh wait: 2 Laptop, 2 Smartphone, 2 Camera) |
| Orders | 3+ (sẽ thêm qua kịch bản demo) |
| Price history records | 5 |

Dataset đủ nhỏ để chạy demo nhanh, đủ đa dạng để cover tất cả 7 kịch bản.
