/**
 * Simple AES-256-CBC encryption/decryption for the agent store.
 * Not military-grade — prevents casual copying of the agent database.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update('valnaa-agent-store-v2').digest();

export function encryptAgentStore(plaintext: string): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  // Prepend IV so we can decrypt later
  return Buffer.concat([iv, encrypted]);
}

export function decryptAgentStore(data: Buffer): string {
  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Load the agent store: prefer encrypted .enc file, fall back to plain JSON.
 * Returns the parsed agent store object.
 */
export function loadAgentStore(): any {
  const encPath = path.join(__dirname, 'agent-store.enc');
  const jsonPath = path.join(__dirname, 'agent-store.json');

  // Try encrypted file first
  if (fs.existsSync(encPath)) {
    try {
      const data = fs.readFileSync(encPath);
      return JSON.parse(decryptAgentStore(data));
    } catch {
      // Fall through to plain JSON
    }
  }

  // Fall back to plain JSON
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }

  return { version: 2, total: 0, agents: [] };
}
