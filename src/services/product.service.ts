import * as mongoRepo from '../repositories/mongodb';
import * as pgRepo from '../repositories/postgres';

export interface ProductListQuery {
  category?: string;
  brand?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export async function listProducts(query: ProductListQuery) {
  const { products, total, page, limit } = await mongoRepo.findProducts(query);

  const inventoryList = await Promise.all(products.map(p => pgRepo.getInventoryForProduct(p._id)));

  const enriched = products.map((p, i) => ({
    ...p.toObject(),
    inventory: inventoryList[i].map(inv => ({
      vendor_id: inv.vendorId,
      vendor_name: inv.vendor.name,
      price: Number(inv.price),
      stock_quantity: inv.stockQuantity,
      status: inv.status,
    })),
  }));

  return { products: enriched, total, page, limit, total_pages: Math.ceil(total / limit) };
}

export async function getProductDetail(productId: number) {
  const [product, inventory] = await Promise.all([
    mongoRepo.findProductById(productId),
    pgRepo.getInventoryForProduct(productId),
  ]);

  if (!product) return null;

  return {
    ...product.toObject(),
    inventory: inventory.map(inv => ({
      vendor_id: inv.vendorId,
      vendor_name: inv.vendor.name,
      price: Number(inv.price),
      stock_quantity: inv.stockQuantity,
      status: inv.status,
    })),
  };
}

export async function getPriceHistory(productId: number, limit = 10) {
  return pgRepo.getPriceHistory(productId, limit);
}

export async function adminUpdatePrice(
  productId: number,
  vendorId: number,
  newPrice: number,
  adminId: number,
) {
  await pgRepo.updateProductPrice(productId, vendorId, newPrice, adminId);
  const history = await pgRepo.getPriceHistory(productId, 1);
  return history[0] ?? null;
}

export async function adminUpdateSpecs(productId: number, specs: Record<string, unknown>) {
  return mongoRepo.updateProductSpecs(productId, specs);
}

export async function adminUpdateStock(productId: number, vendorId: number, stockQuantity: number) {
  return pgRepo.updateInventoryStock(vendorId, productId, stockQuantity);
}
