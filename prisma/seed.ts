import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // TODO: seed roles
  // TODO: seed users (admin + customers)
  // TODO: seed user_roles
  // TODO: seed vendors (with email)
  // TODO: seed inventory
  // TODO: seed price_history (initial prices)
  // TODO: seed sample orders for demo scenarios
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
