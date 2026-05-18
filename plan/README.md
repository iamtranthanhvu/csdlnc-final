# Plan — Hệ thống phân tán bán đồ điện tử (BE)

Tài liệu thiết kế Backend cho đồ án CSDL Nâng cao.

## Danh sách tài liệu

| File | Nội dung |
|---|---|
| [01-overview.md](./01-overview.md) | Tổng quan dự án, mục tiêu, tech stack, phạm vi |
| [02-architecture.md](./02-architecture.md) | Kiến trúc hệ thống, các node, luồng dữ liệu |
| [03-database-schema.md](./03-database-schema.md) | ERD PostgreSQL, MongoDB schema, triggers, functions |
| [04-api-design.md](./04-api-design.md) | API endpoints với curl examples |
| [05-scenarios.md](./05-scenarios.md) | 7 kịch bản demo chi tiết |
| [06-implementation-plan.md](./06-implementation-plan.md) | Project structure, Docker Compose, kế hoạch 4 tuần |
| [07-dataset.md](./07-dataset.md) | Seed data PostgreSQL + MongoDB |

## Tóm tắt nhanh

**Tech stack**: Node.js (Fastify) + PostgreSQL 16 (Master-Slave) + MongoDB 7 + RabbitMQ 3.13

**3 module**: Khách hàng | Sản phẩm | Đơn hàng

**4 kỹ thuật DB cốt lõi**:
1. Row-Level Locking — tránh oversell khi 2 user mua cùng lúc
2. Transaction + Sub-order — đơn hàng đa vendor
3. Message Queue (RabbitMQ) — Flash sale, không overload DB
4. Master-Slave Replication — Read/Write splitting

**Nodes**:
- `pg-master` (HCM): Tất cả WRITE operations
- `pg-slave` (HN): Tất cả READ operations, giảm latency miền Bắc
- `mongodb`: Product specs linh hoạt (Laptop/Camera/Smartphone)
- `rabbitmq`: Buffer requests Flash Sale, Sync Worker
- `api-server`: Fastify, JWT auth, RBAC
- `sync-worker`: Process riêng, subscribe queue → sync MongoDB stock
