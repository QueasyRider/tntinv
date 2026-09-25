import { NextResponse } from "next/server";
import { updateAdminCredentials } from "@/lib/admin-credentials";
import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json() as {
      currentUsername?: string;
      currentPassword?: string;
      username?: string;
      password?: string;
    };
    if (!body.currentUsername || !body.currentPassword || !body.username || !body.password) {
      throw new Error("Current credentials and the new username and password are required.");
    }
    await updateAdminCredentials(body.currentUsername, body.currentPassword, body.username, body.password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: await createSessionToken(body.username.trim()),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
