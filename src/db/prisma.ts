import { PrismaClient } from '@prisma/client';
import { config } from '../config';

// Master: tất cả WRITE operations
export const masterPrisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${config.pg.user}:${config.pg.password}@${config.pg.masterHost}:${config.pg.masterPort}/${config.pg.database}`,
    },
  },
  log: config.nodeEnv === 'development' ? ['query', 'error'] : ['error'],
});

// Slave: tất cả READ operations
export const slavePrisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${config.pg.readonlyUser}:${config.pg.readonlyPassword}@${config.pg.slaveHost}:${config.pg.slavePort}/${config.pg.database}`,
    },
  },
  log: config.nodeEnv === 'development' ? ['error'] : ['error'],
});

export async function connectPostgres() {
  await masterPrisma.$connect();
  await slavePrisma.$connect();
}

export async function disconnectPostgres() {
  await masterPrisma.$disconnect();
  await slavePrisma.$disconnect();
}
