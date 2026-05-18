# API Design

Base URL: `http://localhost:3000/api/v1`

Auth header (required for protected routes):
```
Authorization: Bearer <access_token>
```

---

## 1. Authentication

### POST `/auth/register`
Đăng ký tài khoản khách hàng.

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lê Ngọc An",
    "email": "anle@gmail.com",
    "phone": "0912222333",
    "password": "SecurePass123!"
  }'
```

Response `201`:
```json
{
  "user_id": 102,
  "name": "Lê Ngọc An",
  "email": "anle@gmail.com",
  "role": "customer"
}
```

### POST `/auth/login`

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "anle@gmail.com",
    "password": "SecurePass123!"
  }'
```

Response `200`:
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "expires_in": 3600
}
```

### POST `/auth/refresh`
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refresh_token": "eyJhbGci..." }'
```

---

## 2. Products

> READ path — query vào **PostgreSQL Slave** (price, stock) + **MongoDB** (specs)

### GET `/products`
Danh sách sản phẩm với filter/pagination.

```bash
curl "http://localhost:3000/api/v1/products?category=Laptop&brand=Dell&page=1&limit=10&sort=price_asc"
```

Query params:
| Param | Type | Mô tả |
|---|---|---|
| `category` | string | Laptop / Smartphone / Camera |
| `brand` | string | Filter theo hãng |
| `page` | int | Default: 1 |
| `limit` | int | Default: 20, max: 100 |
| `sort` | string | `price_asc`, `price_desc`, `newest` |
| `search` | string | Full-text search MongoDB |

Response `200`:
```json
{
  "data": [
    {
      "product_id": 2001,
      "name": "Dell XPS 15 9530",
      "category": "Laptop",
      "brand": "Dell",
      "price": 45000000,
      "stock_quantity": 15,
      "specs": { "cpu": "...", "ram": "..." },
      "vendors": [
        { "vendor_id": 501, "name": "GearVN Store" }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 45 }
}
```

### GET `/products/:product_id`
Chi tiết sản phẩm (kết hợp PostgreSQL Slave + MongoDB).

```bash
curl http://localhost:3000/api/v1/products/2001
```

### GET `/products/:product_id/price-history`
Lịch sử biến động giá — READ từ Slave.

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/products/2001/price-history?limit=10"
```

Response:
```json
{
  "product_id": 2001,
  "history": [
    {
      "old_price": 48000000,
      "new_price": 45000000,
      "changed_at": "2023-09-15T10:00:00Z",
      "changed_by": "Admin"
    }
  ]
}
```

---

## 3. Orders

### POST `/orders`
Tạo đơn hàng mới — WRITE vào **PostgreSQL Master**.

**Kịch bản 1 & 2**: Xử lý transaction + sub-order theo vendor.

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "product_id": 2001, "vendor_id": 501, "quantity": 1 },
      { "product_id": 2002, "vendor_id": 501, "quantity": 2 }
    ],
    "shipping_address": "123 Lê Lợi, Q1, HCM"
  }'
```

Response `201`:
```json
{
  "order_id": 1004,
  "status": "pending",
  "total_price": 109000000,
  "sub_orders": [
    { "sub_order_id": 201, "vendor_id": 501, "vendor_name": "GearVN Store", "subtotal": 109000000 }
  ],
  "payment_url": "/api/v1/orders/1004/payment"
}
```

**Logic xử lý (Transaction + Row-Level Locking):**
```sql
BEGIN;
  -- Lock tồn kho (row-level lock, không lock cả bảng)
  SELECT * FROM inventory WHERE product_id IN (2001, 2002) FOR UPDATE;
  
  -- Kiểm tra tồn kho
  -- Tạo order + order_items + sub_orders
  -- Trigger sẽ tự trừ tồn kho sau khi confirmed
COMMIT;
```

### POST `/orders/:order_id/payment`
Xác nhận thanh toán — chuyển status từ `pending` → `confirmed`.

```bash
curl -X POST http://localhost:3000/api/v1/orders/1004/payment \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{ "payment_method": "banking" }'
```

Response `200`:
```json
{
  "order_id": 1004,
  "status": "confirmed",
  "payment_status": "paid",
  "message": "Đặt hàng thành công"
}
```

**Logic sau COMMIT:**
1. Trigger tự động trừ `inventory.stock_quantity`
2. API Server publish event `order.confirmed` → RabbitMQ
3. Sync Worker nhận event → UPDATE `stock_quantity` trong MongoDB

### GET `/orders`
Danh sách đơn hàng của customer đang đăng nhập — READ từ **Slave**.

```bash
curl -H "Authorization: Bearer <customer_token>" \
  "http://localhost:3000/api/v1/orders?status=completed&page=1&limit=10"
```

### GET `/orders/:order_id`
Chi tiết đơn hàng — READ từ **Slave**.

```bash
curl -H "Authorization: Bearer <customer_token>" \
  http://localhost:3000/api/v1/orders/1004
```

---

## 4. Flash Sale (Message Queue)

### POST `/flash-sale/:sale_id/purchase`
**Kịch bản 3**: Xử lý qua RabbitMQ queue, không trực tiếp ghi DB.

```bash
curl -X POST http://localhost:3000/api/v1/flash-sale/10/purchase \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{ "product_id": 2001, "quantity": 1 }'
```

Response `202 Accepted` (không phải 201):
```json
{
  "message": "Yêu cầu đặt hàng đã được tiếp nhận",
  "queue_position": 47,
  "estimated_result_at": "2024-01-01T10:00:05Z"
}
```

### GET `/flash-sale/orders/:order_id/status`
Kiểm tra kết quả xử lý flash sale order.

```bash
curl -H "Authorization: Bearer <customer_token>" \
  http://localhost:3000/api/v1/flash-sale/orders/1005/status
```

---

## 5. Admin — Products & Pricing

> Yêu cầu role `admin`

### PUT `/admin/products/:product_id/price`
Cập nhật giá sản phẩm, tự động ghi Price_History — WRITE vào **Master**.

```bash
curl -X PUT http://localhost:3000/api/v1/admin/products/2001/price \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": 501,
    "new_price": 43500000,
    "reason": "Giá nhập mới từ GearVN tháng 10"
  }'
```

Response `200`:
```json
{
  "product_id": 2001,
  "vendor_id": 501,
  "old_price": 45000000,
  "new_price": 43500000,
  "history_id": 4
}
```

### PUT `/admin/products/:product_id/specs`
Cập nhật specs kỹ thuật — WRITE vào **MongoDB**.

```bash
curl -X PUT http://localhost:3000/api/v1/admin/products/2001/specs \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "specs": {
      "cpu": "Intel Core i9-13900H",
      "ram": "64GB DDR5",
      "ssd": "2TB NVMe"
    }
  }'
```

### PUT `/admin/products/:product_id/stock`
Cập nhật tồn kho — WRITE vào **Master** (inventory table).

```bash
curl -X PUT http://localhost:3000/api/v1/admin/products/2001/stock \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "stock_quantity": 25 }'
```

---

## 6. Admin — Reports

### GET `/admin/reports/monthly-revenue`
Thống kê doanh thu theo tháng — dùng Cursor trong PostgreSQL.

```bash
curl -H "Authorization: Bearer <admin_token>" \
  "http://localhost:3000/api/v1/admin/reports/monthly-revenue?year=2023&month=10"
```

Response `200`:
```json
{
  "year": 2023,
  "month": 10,
  "vendors": [
    {
      "vendor_id": 501,
      "vendor_name": "GearVN Store",
      "total_revenue": 245000000
    }
  ],
  "total_platform_revenue": 245000000
}
```

### GET `/admin/reports/low-stock`
Sản phẩm sắp hết hàng — Cursor duyệt inventory.

```bash
curl -H "Authorization: Bearer <admin_token>" \
  "http://localhost:3000/api/v1/admin/reports/low-stock?threshold=5"
```

---

## 7. Admin — Vendors

### GET `/admin/vendors`
### POST `/admin/vendors`
### PUT `/admin/vendors/:vendor_id`

```bash
# Tạo vendor mới
curl -X POST http://localhost:3000/api/v1/admin/vendors \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cellphones S",
    "warehouse_address": "75 Bạch Đằng, Bình Thạnh, HCM"
  }'
```

---

## HTTP Status Codes

| Code | Ý nghĩa |
|---|---|
| 200 | Thành công |
| 201 | Tạo mới thành công |
| 202 | Request tiếp nhận (async) |
| 400 | Bad Request — validation error |
| 401 | Unauthorized — token invalid/expired |
| 403 | Forbidden — không đủ quyền |
| 404 | Not Found |
| 409 | Conflict — tồn kho không đủ |
| 422 | Unprocessable — business logic error |
| 500 | Internal Server Error |

## Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Sản phẩm #2001 chỉ còn 2 trong kho, không đủ số lượng yêu cầu (5)",
    "details": { "product_id": 2001, "available": 2, "requested": 5 }
  }
}
```
