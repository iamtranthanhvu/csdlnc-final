import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { config } from './config';
import { authRoutes } from './api/auth';
import { productRoutes } from './api/products';
import { orderRoutes } from './api/orders';
import { flashSaleRoutes } from './api/flash-sale';
import { adminRoutes } from './api/admin';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
    ajv: {
      customOptions: {
        keywords: ['example'],
      },
    },
  });

  app.register(cors, { origin: true });
  app.register(jwt, { secret: config.jwt.secret! });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'TechShop API',
        version: '1.0.0',
        description: 'API cho hệ thống e-commerce TechShop (PostgreSQL + MongoDB + RabbitMQ)',
      },
      servers: [{ url: `http://localhost:${config.port}`, description: 'Development' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Lấy token từ POST /api/v1/auth/login',
          },
        },
      },
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });

  const prefix = '/api/v1';
  app.register(authRoutes, { prefix: `${prefix}/auth` });
  app.register(productRoutes, { prefix: `${prefix}/products` });
  app.register(orderRoutes, { prefix: `${prefix}/orders` });
  app.register(flashSaleRoutes, { prefix: `${prefix}/flash-sale` });
  app.register(adminRoutes, { prefix: `${prefix}/admin` });

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? error.statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
    app.log.error(error);
    return reply.status(statusCode).send({ error: { code, message: error.message } });
  });

  return app;
}
