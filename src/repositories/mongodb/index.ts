import { Product } from '../../models/product.model';

export async function findProducts(filters: {
  category?: string;
  brand?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}) {
  const { category, brand, search, page = 1, limit = 20, sort = 'name' } = filters;
  const query: Record<string, unknown> = {};
  if (category) query.category = category;
  if (brand) query.brand = brand;
  if (search) query.$text = { $search: search };

  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(query).skip(skip).limit(limit).sort(sort),
    Product.countDocuments(query),
  ]);

  return { products, total, page, limit };
}

export async function findProductById(productId: number) {
  return Product.findById(productId);
}

export async function updateProductSpecs(productId: number, specs: Record<string, unknown>) {
  return Product.findByIdAndUpdate(
    productId,
    { $set: { specs, updatedAt: new Date() } },
    { new: true },
  );
}

export async function updateProductStockInMongo(
  updates: Array<{ productId: number; stockQuantity: number }>,
) {
  if (!updates.length) return;
  await Product.bulkWrite(
    updates.map(u => ({
      updateOne: {
        filter: { _id: u.productId },
        update: { $set: { stockQuantity: u.stockQuantity, updatedAt: new Date() } },
      },
    })),
  );
}
