import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import * as orderService from '../../services/order.service';

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        vendor_id: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  shipping_address: z.string().min(1),
});

const paymentSchema = z.object({
  payment_method: z.enum(['banking', 'cod', 'wallet']),
});

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
};

export async function orderRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      tags: ['Orders'],
      summary: 'Tao don hang moi (kich ban 1 & 2)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['items', 'shipping_address'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['product_id', 'vendor_id', 'quantity'],
              properties: {
                product_id: { type: 'integer', example: 2001 },
                vendor_id: { type: 'integer', example: 1 },
                quantity: { type: 'integer', minimum: 1, example: 1 },
              },
            },
          },
          shipping_address: { type: 'string', example: '123 Nguyen Trai, HCM' },
        },
      },
      response: {
        201: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const body = createOrderSchema.parse(request.body);
    const order = await orderService.createOrder({
      customerId: request.user.userId,
      items: body.items.map(i => ({ productId: i.product_id, vendorId: i.vendor_id, quantity: i.quantity })),
      shippingAddress: body.shipping_address,
    });
    return reply.status(201).send({ data: order });
  });

  app.post('/:order_id/payment', {
    schema: {
      tags: ['Orders'],
      summary: 'Xac nhan thanh toan (kich ban 1 — trigger giam ton kho)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { order_id: { type: 'integer', example: 1 } },
      },
      body: {
        type: 'object',
        required: ['payment_method'],
        properties: {
          payment_method: { type: 'string', enum: ['banking', 'cod', 'wallet'], example: 'banking' },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { order_id } = z
      .object({ order_id: z.coerce.number().int().positive() })
      .parse(request.params);
    paymentSchema.parse(request.body);
    const order = await orderService.confirmPayment(order_id, request.user.userId);
    return reply.send({ data: order });
  });

  app.get('/', {
    schema: {
      tags: ['Orders'],
      summary: 'Danh sach don hang cua toi',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'confirmed', 'shipping', 'completed', 'failed', 'cancelled'],
          },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { status } = z.object({ status: z.string().optional() }).parse(request.query);
    const orders = await orderService.listOrders(request.user.userId, status);
    return reply.send({ data: orders });
  });

  app.get('/:order_id', {
    schema: {
      tags: ['Orders'],
      summary: 'Chi tiet don hang',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { order_id: { type: 'integer', example: 1 } },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
        404: errorSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { order_id } = z
      .object({ order_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const order = await orderService.getOrderDetail(order_id, request.user.userId);
    return reply.send({ data: order });
  });
}
