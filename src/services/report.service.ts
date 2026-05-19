import * as pgRepo from '../repositories/postgres';

export async function getMonthlyRevenue(year: number, month: number) {
  const rows = await pgRepo.getMonthlyRevenue(year, month);
  const vendors = rows.map(r => ({
    vendor_id: Number(r.vendor_id),
    vendor_name: r.vendor_name,
    total_revenue: Number(r.total_revenue),
  }));
  const platform_total = vendors.reduce((sum, v) => sum + v.total_revenue, 0);
  return { year, month, vendors, platform_total };
}

export async function getLowStockReport(threshold = 5) {
  const rows = await pgRepo.getLowStockProducts(threshold);
  return rows.map(r => ({
    vendor_id: Number(r.vendor_id),
    product_id: Number(r.product_id),
    stock_quantity: Number(r.stock_quantity),
    status: r.status,
  }));
}
