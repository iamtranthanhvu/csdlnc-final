# Kịch bản Demo

## Kịch bản 1: Hai khách hàng cùng mua một sản phẩm (Race Condition)

### Mục đích
Minh họa **Row-Level Locking** và **Transaction Isolation** để tránh oversell.

### Vấn đề cũ (Table-Level Lock)
```
Transaction A: LOCK TABLE inventory → xử lý → UNLOCK
Transaction B: chờ A unlock mới được vào → toàn bộ bảng bị block
```
Nhược điểm: Tắc nghẽn toàn hệ thống dù chỉ 2 người tranh nhau 1 sản phẩm.

### Giải pháp: Row-Level Locking

```
Input: 2 request đồng thời đặt product_id=2001 (còn 1 trong kho)

Transaction A: BEGIN
  SELECT * FROM inventory WHERE product_id=2001 FOR UPDATE  ← lock row này
  → Kiểm tra: stock=1, OK
  → INSERT order, INSERT order_items
  → UPDATE inventory SET stock=0
  COMMIT  → release lock

Transaction B: BEGIN
  SELECT * FROM inventory WHERE product_id=2001 FOR UPDATE  ← chờ A release
  → [A đã commit] stock=0
  → stock=0, tồn kho không đủ → ROLLBACK
  → Trả lỗi 409 INSUFFICIENT_STOCK cho User B
```

### Luồng thực tế
```
User A ──┐
         ├──► API Server ──► pg-master (BEGIN)
User B ──┘                       │
                                 ├── Lock row inventory#2001
                                 │   (B phải chờ)
                                 ├── A: check stock=1, OK
                                 ├── A: insert order_items
                                 ├── COMMIT → release lock
                                 │
                                 ├── B: acquire lock
                                 ├── B: check stock=0, FAIL
                                 └── B: ROLLBACK → 409
```

### Điểm demo
- Dùng 2 terminal gửi concurrent request với `ab` hoặc custom script
- Show PostgreSQL logs: lock acquired / lock waiting / lock released
- Show kết quả: 1 order thành công, 1 order thất bại (không oversell)

---

## Kịch bản 2: Đặt hàng đa nhà cung cấp (Sub-order splitting)

### Mục đích
Minh họa **transaction phức tạp** và **sub-order pattern**.

### Input
Giỏ hàng 2 sản phẩm từ 2 vendor khác nhau:
```json
{
  "items": [
    { "product_id": 2001, "vendor_id": 501, "quantity": 1 },
    { "product_id": 2003, "vendor_id": 502, "quantity": 1 }
  ]
}
```

### Xử lý

```
BEGIN (single transaction):
  1. Lock inventory rows cho 2001, 2003 (FOR UPDATE)
  2. Kiểm tra stock cả 2 sản phẩm
  3. INSERT into orders (status=pending, total=97000000)
  4. INSERT into order_items (2 dòng)
  5. INSERT into sub_orders:
     - sub_order_1: vendor=501 (GearVN), subtotal=45000000
     - sub_order_2: vendor=502 (ThinkPro), subtotal=52000000
  6. [Payment confirmed] → UPDATE orders SET status=confirmed
  7. Trigger fn_deduct_inventory() tự kích hoạt
COMMIT

Sau COMMIT — gửi email thông báo cho từng vendor:
  8. SELECT email FROM vendors WHERE vendor_id IN (501, 502)
  9. Gửi email cho GearVN (vendor_id=501):
       To: gearvn@gearvn.com
       Subject: "[TechShop] Đơn hàng mới #SO-201 cần xử lý"
       Body: sub_order_id, danh sách sản phẩm, subtotal, địa chỉ giao
  10. Gửi email cho ThinkPro (vendor_id=502):
       To: order@thinkpro.vn
       Subject: "[TechShop] Đơn hàng mới #SO-202 cần xử lý"
       Body: sub_order_id, danh sách sản phẩm, subtotal, địa chỉ giao

  ⚠ Email gửi NGOÀI transaction (sau COMMIT) — lỗi email không ảnh hưởng đơn hàng.
```

### Output
```json
{
  "order_id": 1004,
  "total_price": 97000000,
  "sub_orders": [
    { "sub_order_id": 201, "vendor": "GearVN Store", "subtotal": 45000000, "email_sent": true },
    { "sub_order_id": 202, "vendor": "ThinkPro",     "subtotal": 52000000, "email_sent": true }
  ]
}
```

### Rollback scenario
Nếu tồn kho sản phẩm 2003 hết → **toàn bộ transaction rollback**, không tạo order nào, không gửi email.

---

## Kịch bản 3: Flash Sale số lượng giới hạn (Message Queue)

### Mục đích
Minh họa **RabbitMQ** điều tiết lưu lượng khi N requests đổ về cùng lúc.

### Vấn đề nếu không có Queue
```
1000 users cùng bấm "Mua ngay" → 1000 concurrent DB writes
→ connection pool exhausted
→ lock contention cao trên inventory row
→ database timeout / deadlock
```

### Giải pháp với RabbitMQ

```
Phase 1: API Server nhận requests
  User 1..1000 → POST /flash-sale/1/purchase
  API Server:
    - Validate user, product
    - KHÔNG ghi DB
    - Publish message vào queue "order.flash_sale"
    - Return 202 Accepted ngay

Phase 2: Order Worker consume queue (FIFO)
  Worker lấy từng message theo thứ tự:
    Message #1: check stock=50, OK → INSERT order → stock=49
    Message #2: check stock=49, OK → INSERT order → stock=48
    ...
    Message #50: check stock=1, OK → INSERT order → stock=0
    Message #51: check stock=0, FAIL → mark order FAILED, notify user
    ...
    Message #1000: stock=0 → FAILED
```

### Flow diagram

```
1000 Users
    │
    ▼
API Server ──publish──► [RabbitMQ Queue: order.flash_sale]
    │                          │
    │ 202 ngay lập tức          │ consume FIFO
    ▼                          ▼
User nhận phản hồi      Order Worker
"Đang xử lý..."           ├── Msg 1..50: success → INSERT order
                          └── Msg 51..1000: stock=0 → FAILED

                    [Notify user kết quả qua WebSocket/email]
```

### Điểm demo
- Gửi 100 concurrent requests với `ab -n 100 -c 100`
- Show queue depth trong RabbitMQ Management UI
- Show kết quả: đúng số lượng flash sale thành công, không oversell

---

## Kịch bản 4: Read/Write Splitting — Master-Slave

### Mục đích
Minh họa **Master-Slave Replication** tách tải đọc/ghi.

### Input
Đồng thời 2 actions:
1. User A xác nhận mua hàng (WRITE)
2. User B xem chi tiết đơn hàng (READ)

### Routing

```
Request A (POST /orders/1004/payment):
  API Server → masterPool.query("UPDATE orders SET status=confirmed...")
  → Đến pg-master (HCM)
  → COMMIT
  → Streaming Replication → sync sang pg-slave (HN)

Request B (GET /orders/1003):
  API Server → slavePool.query("SELECT * FROM orders WHERE order_id=1003")
  → Đến pg-slave (HN)
  → Không đụng Master, không tăng load Master
```

### Điểm demo
- Dùng `SHOW transaction_read_only;` trên từng connection để chứng minh slave là read-only
- Query `pg_stat_replication` trên Master để show replication lag
- Benchmark: response time READ từ Slave (HN) vs Master (HCM)

```sql
-- Trên Master: xem replication status
SELECT client_addr, state, write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

---

## Kịch bản 5: Admin cập nhật giá + Price History Trigger

### Mục đích
Minh họa **Trigger** tự động ghi audit log khi giá thay đổi.

### Flow
```
Admin PUT /admin/products/2001/price { new_price: 43500000 }
  │
  ▼
API Server → call fn_update_product_price(2001, 501, 43500000, admin_id)
  │
  ▼
PostgreSQL Master:
  INSERT INTO price_history (product_id, old_price=45000000, new_price=43500000)
  COMMIT
```

### Demo
- Show price_history table trước và sau khi update
- Customer xem GET /products/2001/price-history → thấy biến động

---

## Kịch bản 6: Báo cáo cuối tháng với Cursor

### Mục đích
Minh họa **Cursor** duyệt tập kết quả lớn, tính hoa hồng vendor.

### Flow
```
Admin GET /admin/reports/monthly-revenue?year=2023&month=10
  │
  ▼
API Server → call fn_monthly_vendor_commission(2023, 10)
  │
  ▼
PostgreSQL: Cursor duyệt tất cả orders completed trong tháng
  → Tính tổng doanh thu mỗi vendor
  → Return kết quả
```

---

## Kịch bản 7: Cảnh báo tồn kho thấp

### Mục đích
Minh họa **Cursor** duyệt inventory + message queue cho notification.

### Flow
```
Cron job chạy mỗi ngày 8:00 AM:
  → API Server call fn_check_low_stock(threshold=5)
  → Cursor duyệt toàn bộ inventory
    → product có stock < 5 → publish message "notification.low_stock"
  → Notification Worker nhận → gửi email/slack cho Admin
```
