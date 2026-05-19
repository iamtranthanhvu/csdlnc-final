import { getChannel, QUEUES } from '../db/rabbitmq';

export function publishOrderConfirmed(orderId: number): void {
  getChannel().sendToQueue(
    QUEUES.ORDER_CONFIRMED,
    Buffer.from(JSON.stringify({ orderId })),
    { persistent: true },
  );
}

export function publishFlashSaleOrder(data: {
  saleId: number;
  productId: number;
  customerId: number;
  quantity: number;
}): void {
  getChannel().sendToQueue(
    QUEUES.ORDER_FLASH_SALE,
    Buffer.from(JSON.stringify(data)),
    { persistent: true },
  );
}

export function publishLowStockNotification(data: {
  productId: number;
  vendorId: number;
  currentStock: number;
}): void {
  getChannel().sendToQueue(
    QUEUES.NOTIFICATION_LOW_STOCK,
    Buffer.from(JSON.stringify(data)),
    { persistent: true },
  );
}
