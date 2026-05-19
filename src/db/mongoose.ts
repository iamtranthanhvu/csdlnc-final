import mongoose from 'mongoose';
import { config } from '../config';

export async function connectMongo() {
  await mongoose.connect(config.mongo.uri!);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}
