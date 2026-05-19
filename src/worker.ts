import { connectPostgres, disconnectPostgres } from './db/prisma';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { connectRabbitMQ, disconnectRabbitMQ } from './db/rabbitmq';
import { startSyncWorker } from './workers/sync.worker';
import { startOrderWorker } from './workers/order.worker';
import { startNotifWorker } from './workers/notif.worker';

async function start() {
  await connectPostgres();
  await connectMongo();
  await connectRabbitMQ();

  await startSyncWorker();
  await startOrderWorker();
  await startNotifWorker();

  console.log('Workers started');

  const graceful = async () => {
    await disconnectPostgres();
    await disconnectMongo();
    await disconnectRabbitMQ();
    process.exit(0);
  };

  process.on('SIGTERM', graceful);
  process.on('SIGINT', graceful);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
