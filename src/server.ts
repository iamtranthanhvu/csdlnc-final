import { buildApp } from './app';
import { config } from './config';
import { connectPostgres, disconnectPostgres } from './db/prisma';
import { connectMongo, disconnectMongo } from './db/mongoose';
import { connectRabbitMQ, disconnectRabbitMQ } from './db/rabbitmq';

async function start() {
  await connectPostgres();
  await connectMongo();
  await connectRabbitMQ();

  const app = buildApp();

  const graceful = async () => {
    await app.close();
    await disconnectPostgres();
    await disconnectMongo();
    await disconnectRabbitMQ();
    process.exit(0);
  };

  process.on('SIGTERM', graceful);
  process.on('SIGINT', graceful);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
