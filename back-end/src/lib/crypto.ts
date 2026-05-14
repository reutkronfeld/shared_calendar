import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(env.TOKEN_ENC_KEY, 'hex');

export interface EncryptedPayload {
  iv: string;     // hex
  data: string;   // hex (ciphertext + auth tag concatenated)
}

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12); // GCM standard IV length
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    data: Buffer.concat([encrypted, tag]).toString('hex'),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const iv = Buffer.from(payload.iv, 'hex');
  const buf = Buffer.from(payload.data, 'hex');
  // Last 16 bytes of `buf` are the GCM auth tag.
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
