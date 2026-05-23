# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run in separate terminals or via Docker)
npm run dev           # API server with hot reload (src/server.ts)
npm run dev:worker    # Background workers with hot reload (src/worker.ts)

# Build & Production
npm run build         # Compile TypeScript → dist/
npm start             # Run compiled API server
npm run start:worker  # Run compiled workers

# Database
npm run db:generate   # Regenerate Prisma client after schema changes
npm run db:migrate    # Apply pending Prisma migrations
npm run db:seed       # Seed PostgreSQL + MongoDB with sample data
npm run db:studio     # Open Prisma Studio UI (port 5555)

# Code quality
npm run lint          # ESLint
npm run format        # Prettier
```

All infrastructure (PostgreSQL master/slave, MongoDB, RabbitMQ) runs via Docker:
```bash
docker compose -f docker-compose.dev.yml up -d
```

API server: `http://localhost:3000`  
Swagger docs: `http://localhost:3000/docs`  
RabbitMQ UI: `http://localhost:15672`

## Architecture

This is an e-commerce backend demonstrating distributed database patterns: PostgreSQL master-slave replication, MongoDB for flexible product data, and RabbitMQ for async flash-sale processing.

### Request Flow

```
HTTP Request → Fastify (app.ts) → Middleware (auth/rbac) → Route Handler (src/api/)
                                                                     ↓
                                                            Service (src/services/)
                                                                     ↓
                                                         Repository (src/repositories/)
                                                         ├── postgres/ → Prisma ORM
                                                         └── mongodb/  → Mongoose
```

### Master-Slave Read/Write Splitting

Two Prisma clients exist in `src/db/prisma.ts`:
- `masterPrisma` — all writes (INSERT/UPDATE/DELETE) and transactions
- `slavePrisma` — read-only queries (SELECT)

The repositories in `src/repositories/postgres/index.ts` choose the correct client per operation. **Always use `masterPrisma` inside transactions.**

### Key Data Flow Patterns

**Order creation** (`src/services/order.service.ts`): Uses a single Prisma transaction on `masterPrisma` to create Order + OrderItems + SubOrders atomically. A PostgreSQL trigger automatically fires on payment confirmation to reduce inventory.

**Flash sale** (`src/api/flash-sale/`, `src/queues/`): Purchase requests are published to RabbitMQ (`order.flash_sale` queue) and return 202 immediately. The worker (`src/workers/order.worker.ts`) processes them sequentially with row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`) to prevent overselling.

**Product data**: Product identities and specs live in MongoDB (`src/models/product.model.ts` via Mongoose). Inventory (stock, price) lives in PostgreSQL. `src/services/product.service.ts` merges both sources per request.

**Notifications**: Order confirmation events publish to `notification.low_stock` / `order.confirmed` queues. `src/workers/notif.worker.ts` picks these up and sends emails via Nodemailer.

### Fastify Response Schema Serialization

Fastify uses `fast-json-stringify` to serialize responses according to the route's `response` schema. Any object field declared as `{ type: 'object' }` **without** explicit `properties` **must** include `additionalProperties: true`, otherwise all fields are stripped and `{}` is returned. This applies to `{ type: 'array', items: { type: 'object' } }` as well — add `additionalProperties: true` to the `items` object.

### Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `DATABASE_URL` — Prisma CLI target (points to master)
- `PG_MASTER_HOST` / `PG_SLAVE_HOST` — separate read/write hosts
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `RABBITMQ_URL`
- `MONGO_URI`

### Database Schema (PostgreSQL)

Core entities: `User` → `UserRole` → `Role` (RBAC). `Vendor` ↔ `Inventory` (composite PK: `vendor_id + product_id`). `Order` → `OrderItem` + `SubOrder` (one SubOrder per vendor per Order). `PriceHistory` is append-only, populated by a SQL trigger on `Inventory` price changes.

Advanced DB features used: transactions with row-level locking, stored procedures/cursors for reports (`fn_monthly_vendor_commission`, `fn_check_low_stock`), WAL-based streaming replication between master/slave containers.
