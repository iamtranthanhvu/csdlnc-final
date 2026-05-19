# Kế hoạch triển khai

## Cấu trúc project

```
csdlnc-final/
├── documentation/              ← tài liệu thiết kế
│   ├── 01-overview.md
│   ├── 02-architecture.md
│   ├── 03-database-schema.md
│   ├── 04-api-design.md
│   ├── 05-scenarios.md
│   ├── 06-implementation-plan.md
│   └── 07-dataset.md
├── prisma/
│   ├── schema.prisma           ← Prisma schema (models + datasource)
│   ├── migrations/             ← auto-generated Prisma migrations
│   └── seed.ts                 ← seed data PostgreSQL
├── src/
│   ├── api/                    ← HTTP route handlers
│   │   ├── auth/
│   │   │   └── index.ts
│   │   ├── products/
│   │   │   └── index.ts
│   │   ├── orders/
│   │   │   └── index.ts
│   │   ├── flash-sale/
│   │   │   └── index.ts
│   │   └── admin/
│   │       └── index.ts
│   ├── services/               ← business logic
│   │   ├── auth.service.ts
│   │   ├── product.service.ts
│   │   ├── order.service.ts
│   │   ├── email.service.ts    ← gửi email thông báo sub-order cho vendor
│   │   └── report.service.ts
│   ├── repositories/           ← data access layer
│   │   ├── postgres/
│   │   │   └── index.ts        ← Prisma master/slave queries
│   │   └── mongodb/
│   │       └── index.ts        ← Mongoose model queries
│   ├── workers/                ← background processes
│   │   ├── sync.worker.ts      ← MongoDB stock sync
│   │   ├── order.worker.ts     ← flash sale processor
│   │   └── notif.worker.ts     ← low-stock notification
│   ├── queues/                 ← RabbitMQ producers/consumers
│   │   ├── producer.ts
│   │   └── consumer.ts
│   ├── db/                     ← connection setup
│   │   ├── prisma.ts           ← masterPrisma + slavePrisma clients
│   │   ├── mongoose.ts         ← Mongoose connection
│   │   └── rabbitmq.ts         ← RabbitMQ connection + queue names
│   ├── models/                 ← Mongoose schemas
│   │   └── product.model.ts
│   ├── middleware/
│   │   ├── auth.ts             ← JWT verify
│   │   └── rbac.ts             ← role-based access
│   ├── config/
│   │   └── index.ts            ← tập trung env vars
│   ├── app.ts                  ← Fastify app setup + register routes
│   ├── server.ts               ← API Server entry point
│   └── worker.ts               ← Worker entry point (sync + order + notif)
├── scripts/
│   └── init-master.sql         ← SQL init cho PostgreSQL master (chạy lần đầu)
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .eslintignore
├── .prettierrc
├── .prettierignore
├── tsconfig.json
├── package.json
├── Dockerfile.dev              ← Dev image (ts-node + nodemon)
├── Dockerfile.prod             ← Prod image (multi-stage build, TypeScript → dist/)
├── docker-compose.dev.yml      ← Môi trường development
└── docker-compose.prod.yml     ← Môi trường production
```

## Dependencies (package.json)

```json
{
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/cors": "^9.0.1",
    "@prisma/client": "^5.22.0",
    "mongoose": "^8.7.2",
    "amqplib": "^0.10.4",
    "bcryptjs": "^2.4.3",
    "nodemailer": "^6.9.15",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5",
    "pino": "^9.5.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "typescript": "^5.6.3",
    "ts-node": "^10.9.2",
    "@types/node": "^20.17.6",
    "@types/amqplib": "^0.10.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/nodemailer": "^6.4.16",
    "eslint": "^8.57.1",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "prettier": "^3.8.3",
    "eslint-config-prettier": "^9.1.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "nodemon": "^3.1.7"
  }
}
```

## Docker

Môi trường dev và prod được tách riêng hoàn toàn — hai Dockerfile và hai compose file.

### Dockerfile

| File | Mục đích |
|---|---|
| `Dockerfile.dev` | `node:20-alpine` + `ts-node` + `nodemon`. `npm install` chạy trên local (nvm Node 20), không trong container. CMD: `(npx prisma generate \|\| true) && ${DEV_COMMAND}` |
| `Dockerfile.prod` | Multi-stage: stage 1 build TypeScript → `dist/`, stage 2 runtime chỉ copy `dist/` + `node_modules --omit=dev`. Non-root user. |

### docker-compose.dev.yml

```yaml
services:
  csdl_db_master:   # postgres:16, volume pg-master-dev, init-master.sql
  csdl_db_slave:    # postgres:16, volume pg-slave-dev, depends_on master
  csdl_mongodb:     # mongo:7, volume mongo-dev
  csdl_queue:       # rabbitmq:3.13-management, healthcheck: rabbitmq-diagnostics ping
  csdl_server:      # Dockerfile.dev, port ${APP_PORT}:${APP_PORT}, volume .:/app
                    # depends_on: master/slave/mongo (service_started), queue (service_healthy)
  csdl_worker:      # Dockerfile.dev, volume .:/app, DEV_COMMAND=npm run dev:worker

# Chỉ csdl_server expose port ra ngoài. DB/queue chỉ accessible trong dev-network.
```

### docker-compose.prod.yml

```yaml
services:
  csdl_db_master:   # postgres:16, volume pg-master-prod, restart: unless-stopped
  csdl_db_slave:    # postgres:16, volume pg-slave-prod
  csdl_mongodb:     # mongo:7, volume mongo-prod
  csdl_queue:       # rabbitmq:3.13-management, healthcheck
  csdl_server:      # Dockerfile.prod, port ${APP_PORT}:${APP_PORT}, restart: unless-stopped
  csdl_worker:      # Dockerfile.prod, PROD_COMMAND=node dist/worker.js

# Không có node_modules volume — dist/ được copy vào image lúc build.
```

### Khởi động development

```bash
nvm install 20 && nvm use 20
npm install
docker compose -f docker-compose.dev.yml up --build
```

### Tên container (COMPOSE_PROJECT_NAME=csdlnc)

| Container | Service |
|---|---|
| `csdl_db_master` | PostgreSQL Master |
| `csdl_db_slave` | PostgreSQL Slave |
| `csdl_mongodb` | MongoDB |
| `csdl_queue` | RabbitMQ |
| `csdl_server` | API Server |
| `csdl_worker` | Background Workers |

## Trạng thái triển khai

| Module | File | Trạng thái |
|---|---|---|
| Config | `src/config/index.ts` | ✅ Hoàn thành |
| DB connections | `src/db/prisma.ts`, `mongoose.ts`, `rabbitmq.ts` | ✅ Hoàn thành |
| Mongoose Product model | `src/models/product.model.ts` | ✅ Hoàn thành |
| Fastify app setup | `src/app.ts` | ✅ Hoàn thành |
| API Server entry | `src/server.ts` | ✅ Hoàn thành |
| Worker entry | `src/worker.ts` | ✅ Hoàn thành |
| JWT interface | `src/middleware/auth.ts` (`JwtPayload`) | ✅ Hoàn thành |
| Prisma schema | `prisma/schema.prisma` | ❌ Chưa implement (chỉ có placeholder model) |
| Auth middleware | `src/middleware/auth.ts` (`authenticate`) | ⏳ Stub — TODO |
| RBAC middleware | `src/middleware/rbac.ts` | ⏳ Stub — TODO |
| Auth API | `src/api/auth/index.ts` | ⏳ Stub — trả 501 |
| Products API | `src/api/products/index.ts` | ⏳ Stub — trả 501 |
| Orders API | `src/api/orders/index.ts` | ⏳ Stub — trả 501 |
| Flash Sale API | `src/api/flash-sale/index.ts` | ⏳ Stub — trả 501 |
| Admin API | `src/api/admin/index.ts` | ⏳ Stub — trả 501 |
| Auth service | `src/services/auth.service.ts` | ⏳ Stub — TODO |
| Product service | `src/services/product.service.ts` | ⏳ Stub — TODO |
| Order service | `src/services/order.service.ts` | ⏳ Stub — TODO |
| Email service | `src/services/email.service.ts` | ⏳ Stub — TODO |
| Report service | `src/services/report.service.ts` | ⏳ Stub — TODO |
| PostgreSQL repo | `src/repositories/postgres/index.ts` | ⏳ Stub — TODO |
| MongoDB repo | `src/repositories/mongodb/index.ts` | ⏳ Stub — TODO |
| RabbitMQ producer | `src/queues/producer.ts` | ⏳ Stub — TODO |
| RabbitMQ consumer | `src/queues/consumer.ts` | ⏳ Stub — TODO |
| Sync worker | `src/workers/sync.worker.ts` | ⏳ Stub — TODO |
| Order worker | `src/workers/order.worker.ts` | ⏳ Stub — TODO |
| Notif worker | `src/workers/notif.worker.ts` | ⏳ Stub — TODO |

> Chú thích: ✅ = hoàn thành, ⏳ = stub (file tồn tại, chưa có logic), ❌ = chưa bắt đầu

