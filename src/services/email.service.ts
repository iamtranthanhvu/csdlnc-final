import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export interface SubOrderEmailData {
  subOrderId: number;
  vendorName: string;
  vendorEmail: string;
  orderId: number;
  items: Array<{ productId: number; quantity: number; priceAtTime: number }>;
  subtotal: number;
  shippingAddress: string;
}

export async function sendVendorSubOrderEmail(data: SubOrderEmailData): Promise<boolean> {
  if (!data.vendorEmail) return false;
  try {
    const itemLines = data.items
      .map(i => `  - Product #${i.productId}: x${i.quantity} @ ${i.priceAtTime.toLocaleString('vi-VN')}₫`)
      .join('\n');

    await transporter.sendMail({
      from: config.smtp.from,
      to: data.vendorEmail,
      subject: `[TechShop] Đơn hàng mới #SO-${data.subOrderId}`,
      text: [
        `Xin chào ${data.vendorName},`,
        ``,
        `Bạn có đơn hàng mới #${data.orderId} (sub-order #${data.subOrderId}).`,
        ``,
        `Sản phẩm:`,
        itemLines,
        ``,
        `Tổng phụ: ${data.subtotal.toLocaleString('vi-VN')}₫`,
        `Địa chỉ giao hàng: ${data.shippingAddress}`,
        ``,
        `Vui lòng xác nhận và chuẩn bị hàng.`,
        ``,
        `TechShop Team`,
      ].join('\n'),
    });
    return true;
  } catch {
    return false;
  }
}
