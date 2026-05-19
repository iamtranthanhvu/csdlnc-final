import { getChannel, QUEUES } from '../db/rabbitmq';

export function consumeOrderConfirmed(handler: (orderId: number) => Promise<void>): void {
  getChannel().consume(
    QUEUES.ORDER_CONFIRMED,
    async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data.orderId);
        getChannel().ack(msg);
      } catch (err) {
        console.error('[consumer] ORDER_CONFIRMED error:', err);
        getChannel().nack(msg, false, true);
      }
    },
    { noAck: false },
  );
}

export function consumeFlashSaleOrder(
  handler: (data: {
    saleId: number;
    productId: number;
    customerId: number;
    quantity: number;
  }) => Promise<void>,
): void {
  getChannel().consume(
    QUEUES.ORDER_FLASH_SALE,
    async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data);
        getChannel().ack(msg);
      } catch (err) {
        console.error('[consumer] ORDER_FLASH_SALE error:', err);
        getChannel().nack(msg, false, false);
      }
    },
    { noAck: false },
  );
}

export function consumeLowStockNotification(
  handler: (data: { productId: number; vendorId: number; currentStock: number }) => Promise<void>,
): void {
  getChannel().consume(
    QUEUES.NOTIFICATION_LOW_STOCK,
    async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data);
        getChannel().ack(msg);
      } catch (err) {
        console.error('[consumer] NOTIFICATION_LOW_STOCK error:', err);
        getChannel().nack(msg, false, true);
      }
    },
    { noAck: false },
  );
}
