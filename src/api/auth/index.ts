import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import * as authService from '../../services/auth.service';

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refresh_token: z.string(),
});

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Đăng ký tài khoản mới',
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1, example: 'Nguyễn Văn A' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          phone: { type: 'string', example: '0912345678' },
          password: { type: 'string', minLength: 8, example: 'Secret@123' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                userId: { type: 'integer' },
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string', nullable: true },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const user = await authService.register(body);
    return reply.status(201).send({ data: user });
  });

  app.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Đăng nhập — lấy JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@techshop.vn' },
          password: { type: 'string', example: 'Secret@123' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                refresh_token: { type: 'string' },
                expires_in: { type: 'integer' },
                user: {
                  type: 'object',
                  properties: {
                    userId: { type: 'integer' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                    roles: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const payload = await authService.verifyCredentials(body.email, body.password);
    const { name, ...jwtPayload } = payload;
    const accessToken = app.jwt.sign(jwtPayload, { expiresIn: config.jwt.expiresIn });
    const refreshToken = app.jwt.sign(
      { ...jwtPayload, type: 'refresh' },
      { expiresIn: config.jwt.refreshExpiresIn },
    );
    return reply.send({
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: config.jwt.expiresIn,
        user: { userId: payload.userId, email: payload.email, name, roles: payload.roles },
      },
    });
  });

  app.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Làm mới access token',
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                expires_in: { type: 'integer' },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { refresh_token } = refreshSchema.parse(request.body);
    try {
      const decoded = app.jwt.verify<{ userId: number; email: string; roles: string[]; type?: string }>(
        refresh_token,
      );
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Not a refresh token' } });
      }
      const jwtPayload = { userId: decoded.userId, email: decoded.email, roles: decoded.roles };
      const accessToken = app.jwt.sign(jwtPayload, { expiresIn: config.jwt.expiresIn });
      return reply.send({ data: { access_token: accessToken, expires_in: config.jwt.expiresIn } });
    } catch {
      return reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' } });
    }
  });
}
