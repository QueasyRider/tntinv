import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "inventory_admin_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SESSION_ISSUER = "inventory-transfer";
const SESSION_AUDIENCE = "inventory-admin";

export interface AdminSession {
  username: string;
  role: "admin";
}

function configuredUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || "";
}

function sessionKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

export function isAuthConfigured(): boolean {
  return Boolean(configuredUsername() && process.env.ADMIN_PASSWORD && sessionKey());
}

export async function createSessionToken(username: string): Promise<string> {
  const key = sessionKey();
  if (!key || !isAuthConfigured()) throw new Error("Application login is not configured.");

  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(username)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(token?: string): Promise<AdminSession | null> {
  const key = sessionKey();
  if (!token || !key || !isAuthConfigured()) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.role !== "admin") return null;
    return { username: payload.sub, role: "admin" };
  } catch {
    return null;
  }
}
