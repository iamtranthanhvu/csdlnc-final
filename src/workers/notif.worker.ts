import { consumeLowStockNotification } from '../queues/consumer';

export async function startNotifWorker() {
  consumeLowStockNotification(async (data) => {
    const { productId, vendorId, currentStock } = data;
    console.warn(
      `[notif.worker] LOW STOCK ALERT — product_id=${productId}, vendor_id=${vendorId}, current_stock=${currentStock}`,
    );
  });
}
