import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url(),

  MONGO_URI: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  TOKEN_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENC_KEY must be 64 hex chars (32 bytes)'),

  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-haiku-4.5'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
