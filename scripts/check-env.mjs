import { Buffer } from "node:buffer";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const checks = [];
const add = (name, valid, detail) => checks.push({ name, valid, detail });
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "";
const encryptionKey = process.env.APP_ENCRYPTION_KEY || "";
const publicUrl = process.env.PUBLIC_APP_URL || "";

add("Database", /^postgres(ql)?:\/\//i.test(databaseUrl), databaseUrl ? "Connection string format recognized." : "DATABASE_URL is missing.");
add("Encryption key", encryptionKey.length > 0 && Buffer.from(encryptionKey, "base64").length === 32, encryptionKey ? "Key must decode to exactly 32 bytes." : "APP_ENCRYPTION_KEY is missing.");
add("Administrator username", Boolean(process.env.ADMIN_USERNAME?.trim()), "ADMIN_USERNAME must not be empty.");
add("Administrator password", Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12), "Use a password with at least 12 characters.");
add("Session secret", Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32), "SESSION_SECRET must contain at least 32 characters.");
let publicUrlValid = false;
try {
  const parsed = new URL(publicUrl);
  publicUrlValid = parsed.protocol === "https:" || ["localhost", "127.0.0.1"].includes(parsed.hostname);
} catch {
  publicUrlValid = false;
}
add("Public URL", publicUrlValid, "Use the final HTTPS address, or localhost for development.");

for (const check of checks) console.log(`${check.valid ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
if (checks.some((check) => !check.valid)) process.exitCode = 1;
