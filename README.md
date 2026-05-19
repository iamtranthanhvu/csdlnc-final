# Hệ thống phân tán bán đồ điện tử

Đồ án môn CSDL Nâng cao — Backend e-commerce phân tán theo mô hình Master-Slave.

## Tech stack

| Layer | Công nghệ |
|---|---|
| API Server | Node.js + Fastify + TypeScript |
| Primary DB | PostgreSQL 16 (Master-Slave replication) |
| Document DB | MongoDB 7 (product specs) |
| Message Queue | RabbitMQ 3.13 |
| ORM / ODM | Prisma (PostgreSQL), Mongoose (MongoDB) |
| Auth | JWT (@fastify/jwt) |

## Cấu trúc thư mục

```
csdlnc-final/
├── documentation/      ← tài liệu thiết kế (ERD, API, kịch bản demo)
├── prisma/             ← Prisma schema + migrations + seed
├── src/                ← source code
│   ├── api/            ← HTTP route handlers
│   ├── services/       ← business logic
│   ├── repositories/   ← data access (PostgreSQL + MongoDB)
│   ├── workers/        ← background workers (sync, order, notif)
│   ├── queues/         ← RabbitMQ producer/consumer
│   ├── db/             ← kết nối database
│   ├── middleware/     ← JWT auth, RBAC
│   └── config/         ← env vars
├── scripts/            ← setup replication script
├── Dockerfile.dev
├── Dockerfile.prod
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── package.json
└── .env.example
```

## Yêu cầu

- Docker & Docker Compose v2
- nvm (Node Version Manager)

## Development

### Lần đầu

```bash
cp .env.example .env   # chỉnh JWT_SECRET và SMTP_* trước khi chạy

# Cài đặt Node 20 và install dependencies trên local
nvm install 20
nvm use 20
npm install

# Start toàn bộ containers
docker compose -f docker-compose.dev.yml up --build
```

`prisma generate` chạy tự động trong container khi start.  
Khi thấy `Server listening at http://0.0.0.0:3000` là sẵn sàng.

### Các lần sau

```bash
docker compose -f docker-compose.dev.yml up
```

### Hot reload

Sửa file trong `src/` → nodemon tự reload, không cần restart container.

### Ports (dev)

| Service | Host port |
|---|---|
| API Server | 3000 |
| PostgreSQL Master | 5432 |
| PostgreSQL Slave | 5433 |
| MongoDB | 27017 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ Management UI | 15672 |

### Database migration

```bash
docker compose -f docker-compose.dev.yml exec csdl_server npx prisma migrate dev
```

## Production

```bash
cp .env.example .env   # chỉnh JWT_SECRET, SMTP_*, NODE_ENV=production
docker compose -f docker-compose.prod.yml up --build -d
```

Build TypeScript → tạo `dist/`, chỉ expose port `APP_PORT` (mặc định 3000).  
Tất cả services có `restart: unless-stopped`.

```bash
# Xem logs
docker compose -f docker-compose.prod.yml logs -f csdl_server
```

## Lệnh hữu ích

```bash
# Dừng tất cả containers
docker compose -f docker-compose.dev.yml down

# Xem logs một service
docker compose -f docker-compose.dev.yml logs -f csdl_server

# Mở shell trong container
docker compose -f docker-compose.dev.yml exec csdl_server sh

# Prisma Studio — UI xem DB
docker compose -f docker-compose.dev.yml exec csdl_server npx prisma studio
```

## Các kỹ thuật DB minh hoạ

| # | Kịch bản | Kỹ thuật |
|---|---|---|
| 1 | Hai khách cùng mua 1 sản phẩm | Row-Level Locking |
| 2 | Đặt hàng đa vendor + email vendor | Transaction + Sub-order + Email |
| 3 | Flash sale số lượng giới hạn | RabbitMQ Message Queue |
| 4 | Đọc/ghi song song | Master-Slave Read/Write Splitting |
| 5 | Admin cập nhật giá | Trigger + Audit Log |
| 6 | Báo cáo doanh thu tháng | Cursor (PostgreSQL) |
| 7 | Cảnh báo tồn kho thấp | Cursor + Notification Queue |

## Tài liệu

Xem thư mục [`documentation/`](./documentation/) để biết chi tiết thiết kế, ERD, API design và dataset mẫu.
