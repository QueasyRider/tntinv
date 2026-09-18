import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthConfigured, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

function constantTimeEqual(value: string, expected: string): boolean {
  const valueDigest = createHash("sha256").update(value).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(valueDigest, expectedDigest);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.ADMIN_USERNAME?.trim() || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!isAuthConfigured()) return false;
  return constantTimeEqual(username.trim(), expectedUsername) && constantTimeEqual(password, expectedPassword);
}

export async function getAdminSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requirePageSession() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession(): Promise<Response | null> {
  const session = await getAdminSession();
  return session ? null : Response.json({ ok: false, error: "Authentication required. Please sign in again." }, { status: 401 });
}
