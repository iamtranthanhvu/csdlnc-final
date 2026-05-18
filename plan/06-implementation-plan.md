# Kế hoạch triển khai

## Cấu trúc project

```
csdlnc-final/
├── plan/                       ← tài liệu thiết kế (thư mục hiện tại)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       ← Prisma schema (models + datasource)
│   │   ├── migrations/         ← auto-generated Prisma migrations
│   │   └── seed.ts             ← seed data PostgreSQL
│   ├── src/
│   │   ├── api/                ← HTTP route handlers
│   │   │   ├── auth/
│   │   │   ├── products/
│   │   │   ├── orders/
│   │   │   ├── flash-sale/
│   │   │   └── admin/
│   │   ├── services/           ← business logic
│   │   │   ├── order.service.ts
│   │   │   ├── product.service.ts
│   │   │   ├── auth.service.ts
│   │   │   └── report.service.ts
│   │   ├── repositories/       ← data access layer
│   │   │   ├── postgres/       ← Prisma master/slave queries
│   │   │   └── mongodb/        ← Mongoose model queries
│   │   ├── workers/            ← background processes
│   │   │   ├── sync.worker.ts  ← MongoDB stock sync
│   │   │   ├── order.worker.ts ← flash sale processor
│   │   │   └── notif.worker.ts ← low-stock notification
│   │   ├── queues/             ← RabbitMQ producers/consumers
│   │   │   ├── producer.ts
│   │   │   └── consumer.ts
│   │   ├── db/                 ← connection setup
│   │   │   ├── prisma.ts       ← masterPrisma + slavePrisma clients
│   │   │   ├── mongoose.ts     ← Mongoose connection
│   │   │   └── rabbitmq.ts
│   │   ├── models/             ← Mongoose schemas
│   │   │   └── product.model.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts         ← JWT verify
│   │   │   └── rbac.ts         ← role-based access
│   │   ├── config/
│   │   │   └── index.ts
│   │   ├── app.ts              ← Fastify app setup
│   │   ├── server.ts           ← API Server entry point
│   │   └── worker.ts           ← Worker entry point (sync + order + notif)
│   ├── scripts/
│   │   └── setup-replication.sh
│   ├── .env.example
│   ├── .gitignore
│   ├── .eslintrc.json             ← ESLint rules
│   ├── .eslintignore
│   ├── .prettierrc                ← Prettier config
│   ├── .prettierignore
│   ├── tsconfig.json
│   ├── package.json
│   └── docker-compose.yml
└── documents/                  ← tài liệu gốc
```

## Dependencies (package.json)

```json
{
  "dependencies": {
    "fastify": "^4.x",
    "@fastify/jwt": "^8.x",
    "@fastify/cors": "^9.x",
    "@prisma/client": "^5.x",
    "mongoose": "^8.x",
    "amqplib": "^0.10.x",
    "bcryptjs": "^2.x",
    "zod": "^3.x",
    "dotenv": "^16.x",
    "pino": "^9.x"
  },
  "devDependencies": {
    "prisma": "^5.x",
    "typescript": "^5.x",
    "ts-node": "^10.x",
    "@types/node": "^20.x",
    "@types/amqplib": "^0.10.x",
    "@types/bcryptjs": "^2.x",
    "eslint": "^9.x",
    "@typescript-eslint/eslint-plugin": "^7.x",
    "@typescript-eslint/parser": "^7.x",
    "prettier": "^3.x",
    "eslint-config-prettier": "^9.x",
    "jest": "^29.x",
    "supertest": "^7.x",
    "nodemon": "^3.x"
  }
}
```

## Docker Compose

```yaml
version: "3.9"
services:
  pg-master:
    image: postgres:16
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - pg-master-data:/var/lib/postgresql/data
      - ./scripts/init-master.sql:/docker-entrypoint-initdb.d/01-init.sql
    ports:
      - "5432:5432"

  pg-slave:
    image: postgres:16
    environment:
      POSTGRES_DB: ecommerce
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
      PG_MASTER_HOST: pg-master
    volumes:
      - pg-slave-data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    depends_on:
      - pg-master

  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_DATABASE: ecommerce
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

  rabbitmq:
    image: rabbitmq:3.13-management
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: secret
    ports:
      - "5672:5672"
      - "15672:15672"  # Management UI

  api-server:
    build: .
    command: node src/server.js
    environment:
      PG_MASTER_HOST: pg-master
      PG_SLAVE_HOST: pg-slave
      MONGO_URI: mongodb://mongodb:27017/ecommerce
      RABBITMQ_URL: amqp://admin:secret@rabbitmq
    ports:
      - "3000:3000"
    depends_on:
      - pg-master
      - mongodb
      - rabbitmq

  sync-worker:
    build: .
    command: node src/worker.js
    environment:
      PG_MASTER_HOST: pg-master
      MONGO_URI: mongodb://mongodb:27017/ecommerce
      RABBITMQ_URL: amqp://admin:secret@rabbitmq
    depends_on:
      - pg-master
      - mongodb
      - rabbitmq

volumes:
  pg-master-data:
  pg-slave-data:
  mongo-data:
```

