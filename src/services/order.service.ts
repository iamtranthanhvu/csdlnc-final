import * as pgRepo from '../repositories/postgres';
import { sendVendorSubOrderEmail } from './email.service';
import { publishOrderConfirmed } from '../queues/producer';

export interface OrderItem {
  productId: number;
  vendorId: number;
  quantity: number;
}

export interface CreateOrderInput {
  customerId: number;
  items: OrderItem[];
  shippingAddress: string;
}

export async function createOrder(input: CreateOrderInput) {
  const itemsWithPrice = await Promise.all(
    input.items.map(async item => {
      const inventory = await pgRepo.getInventoryForProduct(item.productId);
      const vendorInv = inventory.find(i => i.vendorId === item.vendorId);
      if (!vendorInv) {
        throw Object.assign(
          new Error(`Product ${item.productId} not available from vendor ${item.vendorId}`),
          { statusCode: 404, code: 'PRODUCT_NOT_FOUND' },
        );
      }
      return { ...item, priceAtTime: Number(vendorInv.price) };
    }),
  );

  const totalPrice = itemsWithPrice.reduce((sum, i) => sum + i.priceAtTime * i.quantity, 0);

  const order = await pgRepo.createOrderWithSubOrders({
    customerId: input.customerId,
    items: itemsWithPrice,
    totalPrice,
  });

  if (order?.subOrders) {
    for (const subOrder of order.subOrders) {
      const vendor = (subOrder as { vendor?: { name: string; email: string | null } }).vendor;
      const subItems = order.orderItems
        .filter(oi => oi.vendorId === subOrder.vendorId)
        .map(oi => ({ productId: oi.productId, quantity: oi.quantity, priceAtTime: Number(oi.priceAtTime) }));

      sendVendorSubOrderEmail({
        subOrderId: subOrder.subOrderId,
        vendorName: vendor?.name ?? '',
        vendorEmail: vendor?.email ?? '',
        orderId: order.orderId,
        items: subItems,
        subtotal: Number(subOrder.subtotal),
        shippingAddress: input.shippingAddress,
      }).catch(() => {});
    }
  }

  return order;
}

export async function confirmPayment(orderId: number, customerId: number) {
  const order = await pgRepo.findOrderById(orderId);
  if (!order) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  }
  if (order.customerId !== customerId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (order.status !== 'pending') {
    throw Object.assign(new Error('Order cannot be confirmed in current status'), {
      statusCode: 409,
      code: 'INVALID_ORDER_STATUS',
    });
  }

  const updated = await pgRepo.confirmOrderPayment(orderId);
  publishOrderConfirmed(orderId);
  return updated;
}

export async function listOrders(customerId: number, status?: string) {
  return pgRepo.findOrdersByCustomer(customerId, status);
}

export async function getOrderDetail(orderId: number, customerId: number) {
  const order = await pgRepo.findOrderById(orderId);
  if (!order) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  }
  if (order.customerId !== customerId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  return order;
}
