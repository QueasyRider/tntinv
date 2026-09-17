import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "./crypto";
import { deleteOauthState, getConnection, getOauthState, getSettings, saveConnectionToken, saveOauthState, updateConnectionTest, updateSettings, upsertImportedProduct } from "./repository";
import type { EtsyConfig, ProviderToken } from "./repository";
import type { ProductCopy, Variant } from "./types";

const ETSY_API = "https://api.etsy.com/v3/application";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  state: string;
  quantity: number;
  tags?: string[];
  price?: { amount: number; divisor: number };
  taxonomy_path?: string[];
  images?: Array<{ url_fullxfull?: string; url_570xN?: string }>;
}

interface EtsyInventory {
  products?: Array<{
    product_id: number;
    sku?: string;
    property_values?: Array<{ property_name?: string; values?: string[] }>;
    offerings?: Array<{ quantity: number; is_enabled: boolean; price?: { amount: number; divisor: number } }>;
  }>;
}

async function refreshEtsyToken(config: EtsyConfig, token: ProviderToken): Promise<ProviderToken> {
  if (!token.refreshToken) throw new Error("Etsy access expired and no refresh token is available. Connect Etsy again.");
  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.keystring, refresh_token: token.refreshToken }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Etsy token refresh failed.");
  const next = {
    ...token,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || token.refreshToken,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : token.expiresAt,
  };
  await saveConnectionToken("etsy", next, "Connected Etsy shop", false);
  return next;
}

async function connectionHeaders(forceRefresh = false) {
  const connection = await getConnection("etsy");
  const config = connection.config;
  let token = connection.token;
  if (!config?.keystring || !config.sharedSecret) throw new Error("Etsy app credentials are not configured.");
  if (!token?.accessToken) throw new Error("Connect Etsy before importing live listings.");
  const expiresSoon = token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now() + 60_000;
  if (forceRefresh || expiresSoon) token = await refreshEtsyToken(config, token);
  return {
    "x-api-key": `${config.keystring}:${config.sharedSecret}`,
    Authorization: `Bearer ${token.accessToken}`,
  };
}

async function etsyFetch<T>(path: string, retry = true): Promise<T> {
  const response = await fetch(`${ETSY_API}${path}`, { headers: await connectionHeaders(), cache: "no-store" });
  if (response.status === 401 && retry) {
    const retried = await fetch(`${ETSY_API}${path}`, { headers: await connectionHeaders(true), cache: "no-store" });
    const retriedBody = await retried.json().catch(() => ({})) as { error?: string } & T;
    if (!retried.ok) throw new Error(retriedBody.error || `Etsy request failed (${retried.status}).`);
    return retriedBody;
  }
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `Etsy request failed (${response.status}).`);
  return body;
}

async function getConnectedShop(): Promise<{ shopId: string; label: string }> {
  const user = await etsyFetch<{ user_id?: number; first_name?: string; login_name?: string }>("/users/me");
  if (!user.user_id) throw new Error("Etsy did not return the connected user ID.");
  const shop = await etsyFetch<{ shop_id?: number; shop_name?: string }>(`/users/${user.user_id}/shops`);
  if (!shop.shop_id) throw new Error("No Etsy shop was found for the connected account.");
  const shopId = String(shop.shop_id);
  await updateSettings({ etsyShopId: shopId });
  return { shopId, label: shop.shop_name || user.first_name || user.login_name || `Etsy shop ${shopId}` };
}

const cents = (money: { amount: number; divisor: number } | undefined, fallback = 0) => money?.divisor ? Math.round((money.amount / money.divisor) * 100) : fallback;

async function listingToProduct(listing: EtsyListing): Promise<ProductCopy> {
  const [inventory, imageResponse] = await Promise.all([
    etsyFetch<EtsyInventory>(`/listings/${listing.listing_id}/inventory`).catch(() => ({ products: [] })),
    etsyFetch<{ results?: Array<{ url_fullxfull?: string; url_570xN?: string }> }>(`/listings/${listing.listing_id}/images`).catch(() => ({ results: listing.images || [] })),
  ]);
  const products = inventory.products || [];
  const variants: Variant[] = products.map((product) => {
    const offering = product.offerings?.find((item) => item.is_enabled) ?? product.offerings?.[0];
    const values = product.property_values?.flatMap((property) => property.values || []) || [];
    const names = product.property_values?.map((property) => property.property_name).filter(Boolean) as string[] | undefined;
    return {
      id: `etsy-${product.product_id}`,
      etsyProductId: String(product.product_id),
      name: values.join(" / ") || "Regular",
      optionName: names?.join(" / ") || "Option",
      optionValue: values.join(" / ") || "Regular",
      sku: product.sku || `ETSY-${listing.listing_id}-${product.product_id}`,
      priceCents: cents(offering?.price, cents(listing.price)),
      quantity: offering?.quantity ?? 0,
    };
  });
  const images = (imageResponse.results || listing.images || []).map((image) => image.url_fullxfull || image.url_570xN).filter(Boolean) as string[];
  return {
    title: listing.title,
    description: listing.description,
    priceCents: variants[0]?.priceCents ?? cents(listing.price),
    sku: variants[0]?.sku || `ETSY-${listing.listing_id}`,
    category: listing.taxonomy_path?.at(-1) || "Unmapped Etsy category",
    tags: listing.tags || [],
    quantity: variants.length ? variants.reduce((sum, variant) => sum + variant.quantity, 0) : listing.quantity,
    state: listing.state,
    images,
    variants: variants.length === 1 && variants[0].name === "Regular" ? [] : variants,
  };
}

export async function importFromEtsy(): Promise<number> {
  const { shopId } = await getConnectedShop();
  let offset = 0;
  const listings: EtsyListing[] = [];
  do {
    const page = await etsyFetch<{ count: number; results: EtsyListing[] }>(`/shops/${shopId}/listings?state=active&limit=100&offset=${offset}`);
    listings.push(...(page.results || []));
    offset += page.results?.length || 0;
    if (!page.results?.length || offset >= page.count) break;
  } while (offset < 10_000);

  for (const listing of listings) {
    await upsertImportedProduct(String(listing.listing_id), await listingToProduct(listing));
  }
  return listings.length;
}

export async function createEtsyAuthorizeUrl(): Promise<string> {
  const connection = await getConnection("etsy");
  if (!connection.config?.keystring) throw new Error("Save Etsy app credentials first.");
  const settings = await getSettings();
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await saveOauthState("etsy", state, encryptJson({ verifier }), new Date(Date.now() + 10 * 60_000).toISOString());
  const redirectUri = `${settings.publicBaseUrl.replace(/\/$/, "")}/api/oauth/etsy/callback`;
  const params = new URLSearchParams({ response_type: "code", client_id: connection.config.keystring, redirect_uri: redirectUri, scope: "listings_r shops_r", state, code_challenge: challenge, code_challenge_method: "S256" });
  return `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

export async function completeEtsyOauth(code: string, state: string): Promise<void> {
  const row = await getOauthState("etsy", state);
  if (!row || new Date(row.expiresAt) < new Date()) throw new Error("Etsy authorization state expired. Start the connection again.");
  const verifier = decryptJson<{ verifier: string }>(row.verifierEnc)?.verifier;
  const connection = await getConnection("etsy");
  const settings = await getSettings();
  if (!verifier || !connection.config?.keystring) throw new Error("Etsy authorization state is invalid.");
  const response = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: connection.config.keystring, redirect_uri: `${settings.publicBaseUrl.replace(/\/$/, "")}/api/oauth/etsy/callback`, code, code_verifier: verifier }),
  });
  const token = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !token.access_token) throw new Error(token.error_description || "Etsy token exchange failed.");
  await saveConnectionToken("etsy", { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined }, "Connected Etsy shop");
  await deleteOauthState(state);
}

export async function testEtsyConnection(): Promise<string> {
  try {
    const { label } = await getConnectedShop();
    await updateConnectionTest("etsy", true, label);
    return label;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Etsy connection test failed.";
    await updateConnectionTest("etsy", false, "Etsy connection", message);
    throw error;
  }
}
