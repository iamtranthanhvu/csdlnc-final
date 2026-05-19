import { consumeFlashSaleOrder } from '../queues/consumer';
import { masterPrisma } from '../db/prisma';

export async function startOrderWorker() {
  consumeFlashSaleOrder(async (data) => {
    const { productId, customerId, quantity } = data;

    await masterPrisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ vendor_id: bigint; price: bigint; stock_quantity: bigint }>
      >`
        SELECT vendor_id, price, stock_quantity FROM inventory
        WHERE product_id = ${productId}
          AND status = 'active'
          AND stock_quantity >= ${quantity}
        ORDER BY price ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!rows[0]) {
        console.log(`[order.worker] Flash sale sold out: product=${productId}`);
        return;
      }

      const vendorId = Number(rows[0].vendor_id);
      const price = Number(rows[0].price);
      const totalPrice = price * quantity;

      const order = await tx.order.create({
        data: { customerId, totalPrice, status: 'confirmed', paymentStatus: 'paid' },
      });

      await tx.orderItem.createMany({
        data: [{ orderId: order.orderId, productId, vendorId, quantity, priceAtTime: price }],
      });

      await tx.subOrder.createMany({
        data: [{ orderId: order.orderId, vendorId, status: 'confirmed', subtotal: totalPrice }],
      });

      await tx.$executeRaw`
        UPDATE inventory
        SET stock_quantity = stock_quantity - ${quantity}, updated_at = NOW()
        WHERE vendor_id = ${vendorId} AND product_id = ${productId}
      `;
    });
  });
}
