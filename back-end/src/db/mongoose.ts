import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectMongo(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5_000,
  });
  // eslint-disable-next-line no-console
  console.log('[mongo] connected');
}
