import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
const KEY_FILE = path.join(DATA_DIR, "master.key");

function getKey(): Buffer {
  const configured = process.env.APP_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_ENCRYPTION_KEY is required in production.");
  }
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(32), { mode: 0o600 });
  return readFileSync(KEY_FILE);
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptJson<T>(payload: string | null): T | null {
  if (!payload) return null;
  const [ivPart, tagPart, valuePart] = payload.split(".");
  if (!ivPart || !tagPart || !valuePart) throw new Error("Encrypted credential payload is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(valuePart, "base64url")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
