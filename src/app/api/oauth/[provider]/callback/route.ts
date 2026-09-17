import { completeEtsyOauth } from "@/lib/etsy";
import { completeSquareOauth } from "@/lib/square";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, context: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider } = await context.params;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error_description") || request.nextUrl.searchParams.get("error");
  try {
    if (providerError) throw new Error(providerError);
    if (!code || !state) throw new Error("The provider did not return an authorization code.");
    if (provider === "etsy") await completeEtsyOauth(code, state);
    else if (provider === "square") await completeSquareOauth(code, state);
    else throw new Error("Unknown OAuth provider.");
    return NextResponse.redirect(new URL(`/?connected=${provider}`, request.url));
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "OAuth connection failed.");
    return NextResponse.redirect(new URL(`/?connectionError=${message}`, request.url));
  }
}
