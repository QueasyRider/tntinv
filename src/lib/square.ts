import "server-only";
import { randomBytes } from "node:crypto";
import { deleteOauthState, getConnection, getOauthState, getSettings, markExported, saveConnectionToken, saveOauthState, updateConnectionTest, validateProduct } from "./repository";
import type { ProviderToken, SquareConfig } from "./repository";
import { resolveExistingSquareCategory } from "./square-categories";
import type { SquareCategorySummary } from "./square-categories";
import type { Product, ProductCopy } from "./types";

const SQUARE_VERSION = "2026-09-16";

function origins(environment: SquareConfig["environment"]) {
  return environment === "production"
    ? { api: "https://connect.squareup.com", oauth: "https://connect.squareup.com/oauth2" }
    : { api: "https://connect.squareupsandbox.com", oauth: "https://connect.squareupsandbox.com/oauth2" };
}

async function refreshSquareToken(config: SquareConfig, token: ProviderToken): Promise<ProviderToken> {
  if (!token.refreshToken) throw new Error("Square access expired and no refresh token is available. Connect Square again.");
  const response = await fetch(`${origins(config.environment).oauth}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": SQUARE_VERSION },
    body: JSON.stringify({ client_id: config.appId, client_secret: config.appSecret, refresh_token: token.refreshToken, grant_type: "refresh_token" }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_at?: string; merchant_id?: string; message?: string; errors?: Array<{ detail?: string }> };
  if (!response.ok || !body.access_token) throw new Error(body.errors?.map((item) => item.detail).filter(Boolean).join(" ") || body.message || "Square token refresh failed.");
  const next = {
    ...token,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || token.refreshToken,
    expiresAt: body.expires_at || token.expiresAt,
    accountId: body.merchant_id || token.accountId,
  };
  await saveConnectionToken("square", next, next.accountId ? `Merchant ${next.accountId}` : "Connected Square account", false);
  return next;
}

async function squareAccess(forceRefresh = false): Promise<{ config: SquareConfig; token: ProviderToken }> {
  const connection = await getConnection("square");
  const config = connection.config;
  let token = connection.token;
  if (!config?.appId || !config.appSecret) throw new Error("Square app credentials are not configured.");
  if (!token?.accessToken) throw new Error("Connect Square before exporting live products.");
  const expiresSoon = token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now() + 5 * 60_000;
  if (forceRefresh || expiresSoon) token = await refreshSquareToken(config, token);
  return { config, token };
}

async function squareFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const access = await squareAccess();
  const response = await fetch(`${origins(access.config.environment).api}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${access.token.accessToken}`, "Square-Version": SQUARE_VERSION, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  if (response.status === 401 && retry) {
    const refreshed = await squareAccess(true);
    return squareFetchWithAccess<T>(path, init, refreshed);
  }
  const body = await response.json().catch(() => ({})) as { errors?: Array<{ detail?: string; code?: string }> } & T;
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((item) => item.detail || item.code).join(" ") || `Square request failed (${response.status}).`);
  return body;
}

async function squareFetchWithAccess<T>(path: string, init: RequestInit, access: { config: SquareConfig; token: ProviderToken }): Promise<T> {
  const response = await fetch(`${origins(access.config.environment).api}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${access.token.accessToken}`, "Square-Version": SQUARE_VERSION, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { errors?: Array<{ detail?: string; code?: string }> } & T;
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((item) => item.detail || item.code).join(" ") || `Square request failed (${response.status}).`);
  return body;
}

function squareObject(product: Product, copy: ProductCopy) {
  const sourceVariants = copy.variants.length ? copy.variants : [{ id: "regular", name: "Regular", optionName: "Option", optionValue: "Regular", sku: copy.sku, priceCents: copy.priceCents, quantity: copy.quantity, squareVariationId: null }];
  const itemId = product.squareItemId || `#item-${product.id}`;
  return {
    type: "ITEM",
    id: itemId,
    ...(product.squareVersion ? { version: product.squareVersion } : {}),
    present_at_all_locations: true,
    item_data: {
      name: copy.title,
      description_plaintext: copy.description,
      product_type: "REGULAR",
      ...(copy.squareCategoryId ? { categories: [{ id: copy.squareCategoryId }] } : {}),
      variations: sourceVariants.map((variant, index) => ({
        type: "ITEM_VARIATION",
        id: variant.squareVariationId || `#variation-${product.id}-${index}`,
        present_at_all_locations: true,
        item_variation_data: {
          item_id: itemId,
          name: variant.name || variant.optionValue || "Regular",
          sku: variant.sku || copy.sku,
          pricing_type: "FIXED_PRICING",
          price_money: { amount: variant.priceCents, currency: "USD" },
          track_inventory: true,
        },
      })),
    },
  };
}

export async function listSquareCategories(): Promise<SquareCategorySummary[]> {
  const categories: SquareCategorySummary[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ types: "CATEGORY" });
    if (cursor) params.set("cursor", cursor);
    const result = await squareFetch<{
      objects?: Array<{ id: string; category_data?: { name?: string; category_type?: string } }>;
      cursor?: string;
    }>(`/v2/catalog/list?${params.toString()}`);
    for (const object of result.objects || []) {
      const name = object.category_data?.name?.trim();
      if (name) categories.push({ id: object.id, name, categoryType: object.category_data?.category_type });
    }
    cursor = result.cursor || undefined;
  } while (cursor);
  return categories;
}

export async function exportProductToSquare(product: Product, idempotencyKey: string, categories: SquareCategorySummary[]): Promise<void> {
  const working = structuredClone(product.working);
  const errors = validateProduct(working).filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join(" "));
  working.squareCategoryId = resolveExistingSquareCategory(working.category, working.squareCategoryId, categories);
  const object = squareObject(product, working);
  const result = await squareFetch<{ objects?: Array<{ id: string; version?: number; item_data?: { variations?: Array<{ id: string }> } }>; id_mappings?: Array<{ client_object_id: string; object_id: string }> }>("/v2/catalog/batch-upsert", {
    method: "POST",
    body: JSON.stringify({ idempotency_key: idempotencyKey, batches: [{ objects: [object] }] }),
  });
  const itemMapping = result.id_mappings?.find((mapping) => mapping.client_object_id === object.id);
  const item = result.objects?.find((candidate) => candidate.id === (itemMapping?.object_id || product.squareItemId)) || result.objects?.[0];
  const squareItemId = itemMapping?.object_id || item?.id;
  if (!squareItemId) throw new Error("Square did not return an item mapping.");
  const source = working.variants.length ? working.variants : [{ id: "regular", name: "Regular", optionName: "Option", optionValue: "Regular", sku: working.sku, priceCents: working.priceCents, quantity: working.quantity }];
  source.forEach((variant, index) => {
    const clientId = `#variation-${product.id}-${index}`;
    const mapping = result.id_mappings?.find((candidate) => candidate.client_object_id === clientId);
    variant.squareVariationId = mapping?.object_id || item?.item_data?.variations?.[index]?.id || variant.squareVariationId;
  });
  if (!working.variants.length) working.variants = source;

  if (working.images[0]) {
    const imageResponse = await fetch(working.images[0]);
    if (imageResponse.ok) {
      const form = new FormData();
      form.set("request", JSON.stringify({ idempotency_key: `${idempotencyKey}-image`, object_id: squareItemId, image: { type: "IMAGE", id: `#image-${product.id}`, image_data: { name: `${working.title} — Etsy import` } } }));
      form.set("image_file", await imageResponse.blob(), "etsy-product.jpg");
      await squareFetch("/v2/catalog/images", { method: "POST", body: form });
    }
  }

  const settings = await getSettings();
  const connection = await getConnection("square");
  const locationId = settings.squareLocationId || connection.config?.locationId;
  if (!locationId) throw new Error("Choose a Square location before setting inventory.");
  const changes = source.filter((variant) => variant.squareVariationId).map((variant) => ({
    type: "PHYSICAL_COUNT",
    physical_count: { catalog_object_id: variant.squareVariationId, state: "IN_STOCK", location_id: locationId, quantity: String(variant.quantity), occurred_at: new Date().toISOString(), reference_id: `${product.etsyListingId}:${variant.id}` },
  }));
  if (changes.length) await squareFetch("/v2/inventory/changes/batch-create", { method: "POST", body: JSON.stringify({ idempotency_key: `${idempotencyKey}-inventory`, changes, ignore_unchanged_counts: true }) });
  await markExported(product.id, squareItemId, item?.version ?? null, working);
}

export async function createSquareAuthorizeUrl(): Promise<string> {
  const connection = await getConnection("square");
  if (!connection.config?.appId) throw new Error("Save Square app credentials first.");
  const state = randomBytes(24).toString("base64url");
  await saveOauthState("square", state, null, new Date(Date.now() + 10 * 60_000).toISOString());
  const settings = await getSettings();
  const redirectUri = `${settings.publicBaseUrl.replace(/\/$/, "")}/api/oauth/square/callback`;
  const params = new URLSearchParams({ client_id: connection.config.appId, scope: "MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE", state, session: connection.config.environment === "production" ? "false" : "true", redirect_uri: redirectUri });
  return `${origins(connection.config.environment).oauth}/authorize?${params.toString()}`;
}

export async function completeSquareOauth(code: string, state: string): Promise<void> {
  const row = await getOauthState("square", state);
  if (!row || new Date(row.expiresAt) < new Date()) throw new Error("Square authorization state expired. Start the connection again.");
  const connection = await getConnection("square");
  if (!connection.config?.appId || !connection.config.appSecret) throw new Error("Square app credentials are incomplete.");
  const settings = await getSettings();
  const redirectUri = `${settings.publicBaseUrl.replace(/\/$/, "")}/api/oauth/square/callback`;
  const response = await fetch(`${origins(connection.config.environment).oauth}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": SQUARE_VERSION },
    body: JSON.stringify({ client_id: connection.config.appId, client_secret: connection.config.appSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
  });
  const token = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_at?: string; merchant_id?: string; message?: string; errors?: Array<{ detail?: string }> };
  if (!response.ok || !token.access_token) throw new Error(token.errors?.map((item) => item.detail).filter(Boolean).join(" ") || token.message || "Square token exchange failed.");
  const label = token.merchant_id ? `Merchant ${token.merchant_id}` : "Connected Square account";
  await saveConnectionToken("square", { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: token.expires_at, accountId: token.merchant_id }, label);
  await deleteOauthState(state);
}

export async function testSquareConnection(): Promise<string> {
  try {
    const result = await squareFetch<{ merchant?: { business_name?: string; id?: string } }>("/v2/merchants/me");
    const label = result.merchant?.business_name || (result.merchant?.id ? `Merchant ${result.merchant.id}` : "Connected Square account");
    await updateConnectionTest("square", true, label);
    return label;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Square connection test failed.";
    await updateConnectionTest("square", false, "Square connection", message);
    throw error;
  }
}
