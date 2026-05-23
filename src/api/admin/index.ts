import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import * as productService from '../../services/product.service';
import * as reportService from '../../services/report.service';
import * as pgRepo from '../../repositories/postgres';

const updatePriceSchema = z.object({
  vendor_id: z.number().int().positive(),
  new_price: z.number().positive(),
  reason: z.string().optional(),
});

const updateSpecsSchema = z.object({
  specs: z.record(z.unknown()),
});

const updateStockSchema = z.object({
  vendor_id: z.number().int().positive(),
  stock_quantity: z.number().int().min(0),
});

const createVendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  warehouse_address: z.string().optional(),
});

const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  warehouse_address: z.string().optional(),
  is_active: z.boolean().optional(),
});

const security = [{ bearerAuth: [] }];

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
  },
};

export async function adminRoutes(app: FastifyInstance) {
  const adminGuard = { preHandler: [authenticate, requireRole('admin')] };

  // --- Products ---

  app.put('/products/:product_id/price', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Cap nhat gia san pham (kich ban 5 — ghi price_history)',
      security,
      params: {
        type: 'object',
        properties: { product_id: { type: 'integer', example: 2001 } },
      },
      body: {
        type: 'object',
        required: ['vendor_id', 'new_price'],
        properties: {
          vendor_id: { type: 'integer', example: 1 },
          new_price: { type: 'number', example: 46000000 },
          reason: { type: 'string' },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
        401: errorSchema,
        403: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { product_id } = z
      .object({ product_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = updatePriceSchema.parse(request.body);
    const record = await productService.adminUpdatePrice(product_id, body.vendor_id, body.new_price, request.user.userId);
    return reply.send({ data: record });
  });

  app.put('/products/:product_id/specs', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Cap nhat specs san pham (MongoDB)',
      security,
      params: {
        type: 'object',
        properties: { product_id: { type: 'integer', example: 2001 } },
      },
      body: {
        type: 'object',
        required: ['specs'],
        properties: {
          specs: { type: 'object', example: { cpu: 'Intel Core i9-14900H', ram: '64GB DDR5' } },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { product_id } = z
      .object({ product_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = updateSpecsSchema.parse(request.body);
    const product = await productService.adminUpdateSpecs(product_id, body.specs);
    if (!product) {
      return reply.status(404).send({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } });
    }
    return reply.send({ data: product });
  });

  app.put('/products/:product_id/stock', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Cap nhat ton kho (PostgreSQL inventory)',
      security,
      params: {
        type: 'object',
        properties: { product_id: { type: 'integer', example: 2001 } },
      },
      body: {
        type: 'object',
        required: ['vendor_id', 'stock_quantity'],
        properties: {
          vendor_id: { type: 'integer', example: 1 },
          stock_quantity: { type: 'integer', minimum: 0, example: 20 },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
      },
    },
  }, async (request, reply) => {
    const { product_id } = z
      .object({ product_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = updateStockSchema.parse(request.body);
    const inventory = await productService.adminUpdateStock(product_id, body.vendor_id, body.stock_quantity);
    return reply.send({ data: inventory });
  });

  // --- Reports ---

  app.get('/reports/monthly-revenue', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Doanh thu theo thang (kich ban 6 — cursor fn_monthly_vendor_commission)',
      security,
      querystring: {
        type: 'object',
        required: ['year', 'month'],
        properties: {
          year: { type: 'integer', example: 2024 },
          month: { type: 'integer', minimum: 1, maximum: 12, example: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                year: { type: 'integer' },
                month: { type: 'integer' },
                vendors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      vendor_id: { type: 'integer' },
                      vendor_name: { type: 'string' },
                      total_revenue: { type: 'number' },
                    },
                  },
                },
                platform_total: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { year, month } = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
      })
      .parse(request.query);
    const report = await reportService.getMonthlyRevenue(year, month);
    return reply.send({ data: report });
  });

  app.get('/reports/low-stock', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'San pham sap het hang (kich ban 7 — cursor fn_check_low_stock)',
      security,
      querystring: {
        type: 'object',
        properties: {
          threshold: { type: 'integer', minimum: 1, default: 5, description: 'Nguong ton kho toi thieu' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vendor_id: { type: 'integer' },
                  product_id: { type: 'integer' },
                  stock_quantity: { type: 'integer' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { threshold } = z
      .object({ threshold: z.coerce.number().int().positive().default(5) })
      .parse(request.query);
    const report = await reportService.getLowStockReport(threshold);
    return reply.send({ data: report });
  });

  // --- Vendors ---

  app.get('/vendors', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Danh sach vendors',
      security,
      response: {
        200: { type: 'object', properties: { data: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
      },
    },
  }, async (request, reply) => {
    const vendors = await pgRepo.findAllVendors();
    return reply.send({ data: vendors });
  });

  app.post('/vendors', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Them vendor moi',
      security,
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'FPT Shop' },
          email: { type: 'string', format: 'email', example: 'order@fptshop.com' },
          warehouse_address: { type: 'string', example: '123 Le Loi, HCM' },
        },
      },
      response: {
        201: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
      },
    },
  }, async (request, reply) => {
    const body = createVendorSchema.parse(request.body);
    const vendor = await pgRepo.createVendor({
      name: body.name,
      email: body.email,
      warehouseAddress: body.warehouse_address,
    });
    return reply.status(201).send({ data: vendor });
  });

  app.put('/vendors/:vendor_id', {
    ...adminGuard,
    schema: {
      tags: ['Admin'],
      summary: 'Cap nhat thong tin vendor',
      security,
      params: {
        type: 'object',
        properties: { vendor_id: { type: 'integer', example: 1 } },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          warehouse_address: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } },
      },
    },
  }, async (request, reply) => {
    const { vendor_id } = z
      .object({ vendor_id: z.coerce.number().int().positive() })
      .parse(request.params);
    const body = updateVendorSchema.parse(request.body);
    const vendor = await pgRepo.updateVendor(vendor_id, {
      name: body.name,
      email: body.email,
      warehouseAddress: body.warehouse_address,
      isActive: body.is_active,
    });
    return reply.send({ data: vendor });
  });
}
