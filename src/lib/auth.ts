import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminCredentials as verifyCredentials } from "@/lib/admin-credentials";
import { isAuthConfigured, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  return verifyCredentials(username, password);
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
