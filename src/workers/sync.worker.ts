import { consumeOrderConfirmed } from '../queues/consumer';
import { findOrderById, getInventoryForProduct } from '../repositories/postgres';
import { updateProductStockInMongo } from '../repositories/mongodb';

export async function startSyncWorker() {
  consumeOrderConfirmed(async (orderId) => {
    const order = await findOrderById(orderId);
    if (!order) return;

    const productIds = [...new Set(order.orderItems.map(i => i.productId))];

    const inventoryList = await Promise.all(productIds.map(id => getInventoryForProduct(id)));

    const updates = productIds.map((productId, idx) => ({
      productId,
      stockQuantity: inventoryList[idx].reduce((sum, inv) => sum + inv.stockQuantity, 0),
    }));

    await updateProductStockInMongo(updates);
  });
}
