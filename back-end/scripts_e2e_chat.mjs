import 'dotenv/config';
import mongoose from 'mongoose';
import { createSigner } from 'fast-jwt';

await mongoose.connect(process.env.MONGO_URI);
const m = await mongoose.connection.db.collection('memberships').findOne({});
if (!m) { console.error('no memberships'); process.exit(1); }
const userId = m.userId.toString();
const groupId = m.groupId.toString();
console.log('membership found. userId=%s groupId=%s', userId, groupId);

const sign = createSigner({ key: process.env.JWT_SECRET });
const token = sign({ sub: userId });

const body = JSON.stringify({
  id: 'm1',
  messages: [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'מה האילוצים שלנו?' }] },
  ],
});

console.log('--> POST /groups/%s/chat', groupId);
const t0 = Date.now();
const res = await fetch(`http://localhost:4001/groups/${groupId}/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'cookie': 'session=' + token,
    'origin': 'http://localhost:3000',
  },
  body,
});
console.log('<-- status:', res.status, '(', Date.now() - t0, 'ms)');
console.log('<-- headers:');
for (const [k, v] of res.headers) console.log('     ', k, ':', v);

if (res.status !== 200) {
  const text = await res.text();
  console.log('body:', text);
  await mongoose.disconnect();
  process.exit(0);
}

if (!res.body) { console.log('no body'); await mongoose.disconnect(); process.exit(0); }

const reader = res.body.getReader();
const dec = new TextDecoder();
let n = 0, total = 0;
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  n++;
  total += value.length;
  if (n <= 8) console.log(`chunk ${n} (${value.length}B): ${dec.decode(value).slice(0, 280)}`);
}
console.log(`stream done. ${n} chunks, ${total} bytes total. elapsed=${Date.now() - t0}ms`);
await mongoose.disconnect();
