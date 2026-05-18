# Kiến trúc hệ thống

## Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                          TẦNG CLIENT                                │
│                                                                     │
│   ┌──────────────────┐           ┌──────────────────┐               │
│   │  Node 3          │           │  Node 4          │               │
│   │  NextJS App      │           │  React Admin     │               │
│   │  (B2C - Khách)   │           │  (Internal)      │               │
│   └────────┬─────────┘           └────────┬─────────┘               │
└────────────┼────────────────────────────── ┼───────────────────────┘
             │ REST/JSON                      │ REST/JSON
             ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          TẦNG BACKEND                               │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Node 5 — API Server (Fastify)                               │  │
│   │  - Authentication (JWT)                                      │  │
│   │  - Authorization (RBAC)                                      │  │
│   │  - Request routing                                           │  │
│   │  - Orchestrator: gọi PostgreSQL (master), MongoDB            │  │
│   │  - Publish events vào RabbitMQ                               │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  Node 5 — Sync Worker (process riêng)                        │  │
│   │  - Subscribe RabbitMQ queues                                 │  │
│   │  - Xử lý đồng bộ stock MongoDB ← PostgreSQL                 │  │
│   │  - Retry logic khi MongoDB tạm thời không khả dụng           │  │
│   └──────────────────────────────────────────────────────────────┘  │
└────────────────────────┬──────────────────────────┬────────────────┘
                         │                          │
          ┌──────────────┼──────────┐               │
          ▼              ▼          ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          TẦNG DATABASE                              │
│                                                                     │
│  ┌─────────────┐   ┌────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Node 1a     │──►│ Node 1b    │  │ Node 2   │  │ Node 6       │  │
│  │ PostgreSQL  │   │ PostgreSQL │  │ MongoDB  │  │ RabbitMQ     │  │
│  │ MASTER      │   │ SLAVE      │  │          │  │              │  │
│  │ (HCM)       │   │ (HN)       │  │          │  │              │  │
│  │ WRITE only  │   │ READ only  │  │          │  │              │  │
│  └─────────────┘   └────────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Mô tả từng node

### Node 1a — PostgreSQL Master (HCM)
- Tiếp nhận **tất cả** các thao tác WRITE: INSERT, UPDATE, DELETE
- Chứa dữ liệu tài chính quan trọng: User, Order, Vendor, Price_History
- Bảo đảm ACID cho các giao dịch thanh toán
- Stream Replication → đồng bộ realtime sang Node 1b

### Node 1b — PostgreSQL Slave (HN)
- Chỉ nhận **READ** requests: xem danh sách sản phẩm, lịch sử đơn hàng
- Giảm độ trễ cho người dùng miền Bắc: 2–5ms thay vì 30–50ms
- Hơn 80% request là READ → offload đáng kể cho Master
- **Không** tiếp nhận WRITE trực tiếp

### Node 2 — MongoDB
- Lưu trữ **specs kỹ thuật linh hoạt** của sản phẩm (JSON document)
- Mỗi danh mục (Laptop, Smartphone, Camera) có schema khác nhau
- Được cập nhật bất đồng bộ thông qua Sync Worker
- READ trực tiếp bởi API Server khi cần hiển thị thông tin sản phẩm

### Node 5 — API Server
- Framework: **Fastify** (hiệu năng cao hơn Express ~2x)
- Đóng vai trò Orchestrator: nhận request → routing → gọi đúng DB
- Phân tách đọc/ghi: WRITE → Master, READ → Slave
- Publish event vào RabbitMQ sau mỗi transaction thành công
- JWT middleware cho toàn bộ protected routes

### Node 5 — Sync Worker (process riêng)
- Chạy độc lập với API Server (không block request handling)
- Subscribe queue `order.confirmed` từ RabbitMQ
- Khi nhận event: cập nhật `stock_quantity` trong MongoDB
- Retry logic với exponential backoff khi MongoDB tạm thời lỗi
- **Bảo đảm Eventual Consistency**: nếu MongoDB sập, event vẫn nằm trong queue cho đến khi được xử lý thành công

### Node 6 — RabbitMQ
**Lý do cần Message Queue:**

Khi Flash Sale xảy ra, hàng nghìn request đặt hàng đổ về cùng lúc. Nếu tất cả trực tiếp cập nhật database:
- Database bị quá tải đột ngột (connection pool exhausted)
- Tăng tranh chấp lock trên cùng row tồn kho
- Dễ dẫn đến deadlock và oversell

RabbitMQ giải quyết bằng cách:
- Buffer các request vào queue → xử lý tuần tự, có kiểm soát
- API trả về `202 Accepted` ngay lập tức → UX không bị block
- Worker xử lý từng message theo thứ tự FIFO
- Nếu MongoDB tạm thời sập → message vẫn tồn tại, không mất dữ liệu

| Queue | Producer | Consumer | Mục đích |
|---|---|---|---|
| `order.confirmed` | API Server | Sync Worker | Đồng bộ stock MongoDB sau khi order thành công |
| `order.flash_sale` | API Server | Order Worker | Xử lý tuần tự đơn hàng Flash Sale |
| `notification.low_stock` | Sync Worker | Notification Worker | Cảnh báo tồn kho thấp |

## Luồng dữ liệu chính

### Luồng 1: Khách hàng đặt hàng thông thường

```
Customer → NextJS → API Server
  → WRITE to PostgreSQL Master (Transaction)
    → Trigger trừ tồn kho SQL
    → COMMIT
  → Publish event "order.confirmed" to RabbitMQ
  → Return 200 OK ngay cho khách

  [Async] Sync Worker nhận event
    → UPDATE stock_quantity in MongoDB
    → Acknowledge message
```

### Luồng 2: Flash Sale

```
N Users → NextJS → API Server
  → Publish N messages to "order.flash_sale" queue
  → Return 202 Accepted ngay cho từng user

  [Async] Order Worker consume queue FIFO
    → Với mỗi message:
      → Check tồn kho còn không?
      → Nếu còn: WRITE to PostgreSQL Master → thành công
      → Nếu hết: mark order FAILED
    → Notify user kết quả
```

### Luồng 3: Đọc dữ liệu sản phẩm (Read path)

```
Customer → NextJS → API Server
  → READ from PostgreSQL Slave (danh sách, giá, tồn kho SQL)
  → READ from MongoDB (specs kỹ thuật)
  → Merge data → Return
```

### Luồng 4: Admin cập nhật giá

```
Admin → React Admin → API Server
  → WRITE new price to PostgreSQL Master
    → Trigger tr_AuditPriceChange tự động lưu Price_History
    → COMMIT
  → Return 200 OK
```

## Phân tách đọc/ghi (Read/Write Splitting)

```typescript
// src/db/prisma.ts — hai PrismaClient trỏ đến 2 DB URL khác nhau
import { PrismaClient } from '@prisma/client';

export const masterPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_MASTER_URL } },
});

export const slavePrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_SLAVE_URL } },
  // Slave là read-only — PostgreSQL sẽ reject write nếu nhầm
});

// Sử dụng trong repository
// READ  → slavePrisma.order.findMany(...)
// WRITE → masterPrisma.order.create(...)
// Raw SQL (stored procedure, FOR UPDATE) → masterPrisma.$queryRaw`...`
```
