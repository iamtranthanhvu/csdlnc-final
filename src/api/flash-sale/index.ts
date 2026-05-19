import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { publishFlashSaleOrder } from '../../queues/producer';
import { findOrderById } from '../../repositories/postgres';

const purchaseSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
};

export async function flashSaleRoutes(app: FastifyInstance) {
  app.post('/:sale_id/purchase', {
    schema: {
      tags: ['Flash Sale'],
      summary: 'Dat mua flash sale (kich ban 3 — queue async)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { sale_id: { type: 'integer', example: 1 } },
      },
      body: {
        type: 'object',
        required: ['product_id', 'quantity'],
        properties: {
          product_id: { type: 'integer', example: 2002 },
          quantity: { type: 'integer', minimum: 1, example: 1 },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                sale_id: { type: 'integer' },
                product_id: { type: 'integer' },
                quantity: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sale_id } = z
      .object({ sale_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = purchaseSchema.parse(request.body);

    publishFlashSaleOrder({
      saleId: sale_id,
      productId: body.product_id,
      customerId: request.user.userId,
      quantity: body.quantity,
    });

    return reply.status(202).send({
      data: {
        message: 'Your order is being processed',
        sale_id,
        product_id: body.product_id,
        quantity: body.quantity,
      },
    });
  });

  app.get('/orders/:order_id/status', {
    schema: {
      tags: ['Flash Sale'],
      summary: 'Kiem tra trang thai don flash sale',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { order_id: { type: 'integer', example: 1 } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                order_id: { type: 'integer' },
                status: { type: 'string' },
                payment_status: { type: 'string' },
              },
            },
          },
        },
        404: errorSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { order_id } = z
      .object({ order_id: z.coerce.number().int().positive() })
      .parse(request.params);

    const order = await findOrderById(order_id);
    if (!order || order.customerId !== request.user.userId) {
      return reply.status(404).send({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' } });
    }
    return reply.send({
      data: { order_id: order.orderId, status: order.status, payment_status: order.paymentStatus },
    });
  });
}
