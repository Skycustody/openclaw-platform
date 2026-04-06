/**
 * Build-time script: encrypts src/data/agent-store.json -> src/data/agent-store.enc
 * Run: npx ts-node scripts/encrypt-agent-store.ts
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update('valnaa-agent-store-v2').digest();

const dataDir = path.join(__dirname, '..', 'src', 'data');
const jsonPath = path.join(dataDir, 'agent-store.json');
const encPath = path.join(dataDir, 'agent-store.enc');

if (!fs.existsSync(jsonPath)) {
  console.error('agent-store.json not found at', jsonPath);
  process.exit(1);
}

const plaintext = fs.readFileSync(jsonPath, 'utf-8');
// Validate it's valid JSON
JSON.parse(plaintext);

const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
const output = Buffer.concat([iv, encrypted]);

fs.writeFileSync(encPath, output);
console.log(`Encrypted agent-store.json -> agent-store.enc (${output.length} bytes)`);

// Delete the plain JSON
fs.unlinkSync(jsonPath);
console.log('Deleted plain agent-store.json');
