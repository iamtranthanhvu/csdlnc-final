import amqplib, { Channel, ChannelModel } from 'amqplib';
import { config } from '../config';

export const QUEUES = {
  ORDER_FLASH_SALE: 'order.flash_sale',
  ORDER_CONFIRMED: 'order.confirmed',
  NOTIFICATION_LOW_STOCK: 'notification.low_stock',
} as const;

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ() {
  connection = await amqplib.connect(config.rabbitmq.url!);
  channel = await connection.createChannel();

  await channel.assertQueue(QUEUES.ORDER_FLASH_SALE, { durable: true });
  await channel.assertQueue(QUEUES.ORDER_CONFIRMED, { durable: true });
  await channel.assertQueue(QUEUES.NOTIFICATION_LOW_STOCK, { durable: true });
}

export function getChannel(): Channel {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
}

export async function disconnectRabbitMQ() {
  await channel?.close();
  await (connection as ChannelModel | null)?.close();
}
