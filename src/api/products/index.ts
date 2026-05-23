import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import * as productService from '../../services/product.service';

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
};

const inventoryItemSchema = {
  type: 'object',
  properties: {
    vendor_id: { type: 'integer' },
    vendor_name: { type: 'string' },
    price: { type: 'number' },
    stock_quantity: { type: 'integer' },
    status: { type: 'string' },
  },
};

export async function productRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: {
      tags: ['Products'],
      summary: 'Danh sách sản phẩm (MongoDB + inventory PostgreSQL)',
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['Laptop', 'Smartphone', 'Camera'], description: 'Lọc theo danh mục' },
          brand: { type: 'string', example: 'Apple', description: 'Lọc theo thương hiệu' },
          search: { type: 'string', description: 'Tìm kiếm fulltext theo tên' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          sort: { type: 'string', default: 'name' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                products: { type: 'array', items: { type: 'object', additionalProperties: true } },
                total: { type: 'integer' },
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total_pages: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const query = z
      .object({
        category: z.string().optional(),
        brand: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        sort: z.string().optional(),
      })
      .parse(request.query);

    const result = await productService.listProducts(query);
    return reply.send({ data: result });
  });

  app.get('/:product_id', {
    schema: {
      tags: ['Products'],
      summary: 'Chi tiết sản phẩm',
      params: {
        type: 'object',
        properties: { product_id: { type: 'integer', example: 2001 } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                _id: { type: 'integer' },
                name: { type: 'string' },
                category: { type: 'string' },
                brand: { type: 'string' },
                specs: { type: 'object', additionalProperties: true },
                inventory: { type: 'array', items: inventoryItemSchema },
              },
            },
          },
        },
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { product_id } = z
      .object({ product_id: z.coerce.number().int().positive() })
      .parse(request.params);

    const product = await productService.getProductDetail(product_id);
    if (!product) {
      return reply.status(404).send({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } });
    }
    return reply.send({ data: product });
  });

  app.get(
    '/:product_id/price-history',
    {
      schema: {
        tags: ['Products'],
        summary: 'Lịch sử thay đổi giá (yêu cầu đăng nhập)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { product_id: { type: 'integer', example: 2001 } },
        },
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, default: 10 } },
        },
        response: {
          200: {
            type: 'object',
            properties: { data: { type: 'array', items: { type: 'object', additionalProperties: true } } },
          },
          401: errorSchema,
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { product_id } = z
        .object({ product_id: z.coerce.number().int().positive() })
        .parse(request.params);
      const { limit } = z
        .object({ limit: z.coerce.number().int().positive().default(10) })
        .parse(request.query);

      const history = await productService.getPriceHistory(product_id, limit);
      return reply.send({ data: history });
    },
  );
}
