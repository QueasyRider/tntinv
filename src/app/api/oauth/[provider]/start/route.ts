import { createEtsyAuthorizeUrl } from "@/lib/etsy";
import { createSquareAuthorizeUrl } from "@/lib/square";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: RouteContext<"/api/oauth/[provider]/start">) {
  try {
    const { provider } = await context.params;
    const url = provider === "etsy" ? await createEtsyAuthorizeUrl() : provider === "square" ? await createSquareAuthorizeUrl() : null;
    if (!url) throw new Error("Unknown OAuth provider.");
    return NextResponse.redirect(url);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Could not start OAuth.");
    return NextResponse.redirect(new URL(`/?connectionError=${message}`, _request.url));
  }
}
