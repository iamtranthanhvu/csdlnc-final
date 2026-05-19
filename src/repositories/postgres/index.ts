import { masterPrisma, slavePrisma } from '../../db/prisma';

// --- User ---

export async function findUserByEmail(email: string) {
  return slavePrisma.user.findUnique({ where: { email } });
}

export async function findUserWithRoles(userId: number) {
  return slavePrisma.user.findUnique({
    where: { userId },
    include: { userRoles: { include: { role: true } } },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  return masterPrisma.user.create({ data });
}

export async function findRoleByName(roleName: string) {
  return slavePrisma.role.findFirst({ where: { roleName } });
}

export async function assignRoleToUser(userId: number, roleId: number) {
  return masterPrisma.userRole.create({ data: { userId, roleId } });
}

// --- Vendor ---

export async function findAllVendors() {
  return slavePrisma.vendor.findMany({ where: { isActive: true }, orderBy: { vendorId: 'asc' } });
}

export async function findVendorById(vendorId: number) {
  return slavePrisma.vendor.findUnique({ where: { vendorId } });
}

export async function createVendor(data: {
  name: string;
  email?: string;
  warehouseAddress?: string;
}) {
  return masterPrisma.vendor.create({ data });
}

export async function updateVendor(
  vendorId: number,
  data: { name?: string; email?: string; warehouseAddress?: string; isActive?: boolean },
) {
  return masterPrisma.vendor.update({ where: { vendorId }, data });
}

// --- Inventory ---

export async function getInventoryForProduct(productId: number) {
  return slavePrisma.inventory.findMany({
    where: { productId, status: 'active' },
    include: { vendor: true },
  });
}

export async function updateInventoryStock(vendorId: number, productId: number, stockQuantity: number) {
  return masterPrisma.inventory.update({
    where: { vendorId_productId: { vendorId, productId } },
    data: { stockQuantity },
  });
}

export async function updateProductPrice(
  productId: number,
  vendorId: number,
  newPrice: number,
  changedBy: number,
) {
  await masterPrisma.$executeRaw`
    SELECT fn_update_product_price(${productId}::int, ${vendorId}::int, ${newPrice}::numeric, ${changedBy}::int)
  `;
}

// --- Order ---

export async function createOrderWithSubOrders(data: {
  customerId: number;
  items: Array<{ productId: number; vendorId: number; quantity: number; priceAtTime: number }>;
  totalPrice: number;
}) {
  return masterPrisma.$transaction(async (tx) => {
    for (const item of data.items) {
      const rows = await tx.$queryRaw<Array<{ stock_quantity: bigint }>>`
        SELECT stock_quantity FROM inventory
        WHERE vendor_id = ${item.vendorId} AND product_id = ${item.productId}
        FOR UPDATE
      `;
      if (!rows[0] || Number(rows[0].stock_quantity) < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for product ${item.productId} from vendor ${item.vendorId}`),
          { statusCode: 409, code: 'INSUFFICIENT_STOCK' },
        );
      }
    }

    const order = await tx.order.create({
      data: {
        customerId: data.customerId,
        totalPrice: data.totalPrice,
        status: 'pending',
        paymentStatus: 'unpaid',
      },
    });

    await tx.orderItem.createMany({
      data: data.items.map(item => ({
        orderId: order.orderId,
        productId: item.productId,
        vendorId: item.vendorId,
        quantity: item.quantity,
        priceAtTime: item.priceAtTime,
      })),
    });

    const vendorSubtotals = new Map<number, number>();
    for (const item of data.items) {
      vendorSubtotals.set(
        item.vendorId,
        (vendorSubtotals.get(item.vendorId) ?? 0) + item.priceAtTime * item.quantity,
      );
    }

    await tx.subOrder.createMany({
      data: Array.from(vendorSubtotals.entries()).map(([vendorId, subtotal]) => ({
        orderId: order.orderId,
        vendorId,
        status: 'pending',
        subtotal,
      })),
    });

    return tx.order.findUnique({
      where: { orderId: order.orderId },
      include: { orderItems: true, subOrders: { include: { vendor: true } } },
    });
  });
}

export async function findOrdersByCustomer(customerId: number, status?: string) {
  return slavePrisma.order.findMany({
    where: { customerId, ...(status && { status }) },
    include: { orderItems: true, subOrders: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findOrderById(orderId: number) {
  return slavePrisma.order.findUnique({
    where: { orderId },
    include: { orderItems: true, subOrders: { include: { vendor: true } } },
  });
}

export async function confirmOrderPayment(orderId: number) {
  return masterPrisma.order.update({
    where: { orderId },
    data: { status: 'confirmed', paymentStatus: 'paid' },
  });
}

// --- Reports ---

export async function getMonthlyRevenue(year: number, month: number) {
  return masterPrisma.$queryRaw<
    Array<{ vendor_id: bigint; vendor_name: string; total_revenue: bigint }>
  >`SELECT * FROM fn_monthly_vendor_commission(${year}::int, ${month}::int)`;
}

export async function getLowStockProducts(threshold: number) {
  return masterPrisma.$queryRaw<
    Array<{ vendor_id: bigint; product_id: bigint; stock_quantity: bigint; status: string }>
  >`SELECT * FROM fn_check_low_stock(${threshold}::int)`;
}

export async function getPriceHistory(productId: number, limit: number) {
  return slavePrisma.priceHistory.findMany({
    where: { productId },
    orderBy: { changedAt: 'desc' },
    take: limit,
    include: { vendor: { select: { name: true } } },
  });
}
