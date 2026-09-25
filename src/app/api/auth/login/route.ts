import { setTimeout as delay } from "node:timers/promises";
import { NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";
import { createSessionToken, isAuthConfigured, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

function safeNext(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function loginRedirect(request: Request, error: string, next: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next") || null);
  if (!isAuthConfigured()) return loginRedirect(request, "not-configured", next);

  const username = typeof form?.get("username") === "string" ? String(form.get("username")) : "";
  const password = typeof form?.get("password") === "string" ? String(form.get("password")) : "";
  if (!await verifyAdminCredentials(username, password)) {
    await delay(450);
    return loginRedirect(request, "invalid", next);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionToken(username.trim()),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
