import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ensureDatabase, getSql } from "./db";

const scrypt = promisify(scryptCallback);

interface AdminCredentialRow {
  username: string;
  password_hash: string;
}

function constantTimeEqual(value: string, expected: string): boolean {
  const valueDigest = createHash("sha256").update(value).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(valueDigest, expectedDigest);
}

async function getStoredCredentials(): Promise<AdminCredentialRow | null> {
  await ensureDatabase();
  const rows = await getSql()`SELECT username, password_hash FROM admin_credentials WHERE id = 1 LIMIT 1` as AdminCredentialRow[];
  return rows[0] || null;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltPart, hashPart] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltPart || !hashPart) return false;
  const expected = Buffer.from(hashPart, "base64url");
  const derived = await scrypt(password, Buffer.from(saltPart, "base64url"), expected.length) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const stored = await getStoredCredentials();
  if (stored) {
    return constantTimeEqual(username.trim(), stored.username) && verifyPassword(password, stored.password_hash);
  }
  const expectedUsername = process.env.ADMIN_USERNAME?.trim() || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!expectedUsername || !expectedPassword) return false;
  return constantTimeEqual(username.trim(), expectedUsername) && constantTimeEqual(password, expectedPassword);
}

export async function updateAdminCredentials(currentUsername: string, currentPassword: string, username: string, password: string): Promise<void> {
  if (!await verifyAdminCredentials(currentUsername, currentPassword)) throw new Error("The current username or password is not correct.");
  const nextUsername = username.trim();
  if (nextUsername.length < 3 || nextUsername.length > 80) throw new Error("Username must be between 3 and 80 characters.");
  if (password.length < 12) throw new Error("New password must be at least 12 characters.");
  const passwordHash = await hashPassword(password);
  await getSql()`
    INSERT INTO admin_credentials (id, username, password_hash, updated_at)
    VALUES (1, ${nextUsername}, ${passwordHash}, ${new Date().toISOString()})
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at
  `;
}

export async function hasDatabaseAdminCredentials(): Promise<boolean> {
  return Boolean(await getStoredCredentials());
}
