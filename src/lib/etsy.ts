import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "./crypto";
import { buildVariationImageLookup, findVariationImage } from "./etsy-variation-images";
import type { EtsyListingImageRef, EtsyVariationImageRef } from "./etsy-variation-images";
import { deleteOauthState, getConnection, getOauthState, getSettings, saveConnectionToken, saveOauthState, updateConnectionTest, updateSettings, upsertImportedProduct } from "./repository";
import type { EtsyConfig, ProviderToken } from "./repository";
import { normalizeProductText } from "./text-format";
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
  taxonomy_id?: number;
  taxonomy_path?: string[];
  shop_section_id?: number | null;
  images?: EtsyListingImageRef[];
}

interface EtsyShopSection {
  shop_section_id: number;
  title: string;
}

interface EtsyTaxonomyNode {
  id: number;
  name: string;
  children?: EtsyTaxonomyNode[];
}

interface EtsyInventory {
  products?: Array<{
    product_id: number;
    sku?: string;
    property_values?: Array<{ property_id?: number; property_name?: string; value_ids?: number[]; values?: string[] }>;
    offerings?: Array<{ quantity: number; is_enabled: boolean; price?: { amount: number; divisor: number } }>;
  }>;
}

interface EtsyBatchInventoryResult {
  listing_id: number;
  inventory: EtsyInventory | null;
}

export interface EtsyImportResult {
  count: number;
  missingImageCount: number;
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

function rateLimitDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds)) return Math.max(250, seconds * 1000);
  const retryDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryDate)) return Math.max(250, retryDate - Date.now());
  return Math.min(8_000, 500 * (2 ** attempt));
}

async function etsyFetch<T>(path: string): Promise<T> {
  let authRetried = false;
  let forceTokenRefresh = false;
  let rateLimitAttempt = 0;
  while (true) {
    const response = await fetch(`${ETSY_API}${path}`, { headers: await connectionHeaders(forceTokenRefresh), cache: "no-store" });
    forceTokenRefresh = false;
    if (response.status === 401 && !authRetried) {
      authRetried = true;
      forceTokenRefresh = true;
      continue;
    }
    if (response.status === 429 && rateLimitAttempt < 5) {
      const delayMs = rateLimitDelay(response, rateLimitAttempt);
      console.warn(JSON.stringify({ level: "warning", message: "Etsy rate limit retry", path, attempt: rateLimitAttempt + 1, delayMs }));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      rateLimitAttempt++;
      continue;
    }
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) throw new Error(body.error || `Etsy request failed (${response.status}).`);
    return body;
  }
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

async function getSellerTaxonomy(): Promise<Map<number, string>> {
  const response = await etsyFetch<{ results?: EtsyTaxonomyNode[] }>("/seller-taxonomy/nodes");
  const categories = new Map<number, string>();
  const visit = (nodes: EtsyTaxonomyNode[], parents: string[] = []) => {
    for (const node of nodes) {
      const path = [...parents, node.name];
      categories.set(node.id, path.join(" > "));
      if (node.children?.length) visit(node.children, path);
    }
  };
  visit(response.results || []);
  return categories;
}

async function getShopSections(shopId: string): Promise<Map<number, string>> {
  const response = await etsyFetch<{ results?: EtsyShopSection[] }>(`/shops/${shopId}/sections`);
  return new Map((response.results || []).map((section) => [section.shop_section_id, section.title.trim()]));
}

async function getListingInventories(listings: EtsyListing[]): Promise<Map<number, EtsyInventory | null>> {
  const inventories = new Map<number, EtsyInventory | null>();
  for (let index = 0; index < listings.length; index += 100) {
    const listingIds = listings.slice(index, index + 100).map((listing) => listing.listing_id);
    const response = await etsyFetch<{ results?: EtsyBatchInventoryResult[] }>(`/listings/batch/inventory?listing_ids=${listingIds.join(",")}`);
    for (const result of response.results || []) inventories.set(result.listing_id, result.inventory);
  }
  const missingIds = listings.filter((listing) => !inventories.has(listing.listing_id)).map((listing) => listing.listing_id);
  if (missingIds.length) throw new Error(`Etsy did not return inventory for ${missingIds.length} listing${missingIds.length === 1 ? "" : "s"}. Import stopped to protect SKU data.`);
  console.log(JSON.stringify({ level: "info", message: "Etsy batch inventory loaded", listingCount: inventories.size }));
  return inventories;
}

async function getListingImages(listing: EtsyListing): Promise<EtsyListingImageRef[]> {
  let listingImages = listing.images || [];
  if (!listingImages.length) {
    try {
      const imageResponse = await etsyFetch<{ results?: EtsyListingImageRef[] }>(`/listings/${listing.listing_id}/images`);
      listingImages = imageResponse.results || [];
    } catch (error) {
      console.warn(JSON.stringify({
        level: "warning",
        message: "Etsy image import failed",
        listingId: listing.listing_id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return listingImages;
}

async function getVariationImageLookup(shopId: string, listingId: number, listingImages: EtsyListingImageRef[]): Promise<Map<string, string>> {
  try {
    const response = await etsyFetch<{ results?: EtsyVariationImageRef[] }>(`/shops/${shopId}/listings/${listingId}/variation-images`);
    return buildVariationImageLookup(response.results || [], listingImages);
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warning",
      message: "Etsy variation image import failed",
      listingId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return new Map();
  }
}

async function listingToProduct(
  listing: EtsyListing,
  taxonomy: Map<number, string>,
  shopSections: Map<number, string>,
  inventory: EtsyInventory | null,
  shopId: string,
): Promise<ProductCopy> {
  const products = inventory?.products || [];
  const listingImages = await getListingImages(listing);
  const hasVariants = products.some((product) => product.property_values?.some((property) => property.values?.length || property.value_ids?.length));
  const variationImageLookup = hasVariants
    ? await getVariationImageLookup(shopId, listing.listing_id, listingImages)
    : new Map<string, string>();
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
      sku: product.sku?.trim() || `${listing.listing_id}-${product.product_id}`,
      priceCents: cents(offering?.price, cents(listing.price)),
      quantity: offering?.quantity ?? 0,
      image: findVariationImage(product.property_values, variationImageLookup),
    };
  });
  const images = listingImages.map((image) => image.url_fullxfull || image.url_570xN).filter(Boolean) as string[];
  if (!images.length) {
    console.warn(JSON.stringify({ level: "warning", message: "Etsy listing returned no usable images", listingId: listing.listing_id }));
  }
  const etsyTaxonomy = (listing.taxonomy_id ? taxonomy.get(listing.taxonomy_id) : undefined)
    || listing.taxonomy_path?.join(" > ")
    || (listing.taxonomy_id ? `Etsy taxonomy #${listing.taxonomy_id}` : "Other");
  const shopSection = listing.shop_section_id ? shopSections.get(listing.shop_section_id) : undefined;
  return normalizeProductText({
    title: listing.title,
    description: listing.description,
    priceCents: variants[0]?.priceCents ?? cents(listing.price),
    sku: variants[0]?.sku || String(listing.listing_id),
    category: shopSection || etsyTaxonomy,
    shopSection,
    etsyTaxonomy,
    tags: listing.tags || [],
    quantity: variants.length ? variants.reduce((sum, variant) => sum + variant.quantity, 0) : listing.quantity,
    state: listing.state,
    images,
    variants: variants.length === 1 && variants[0].name === "Regular" ? [] : variants,
  });
}

export async function importFromEtsy(): Promise<EtsyImportResult> {
  const { shopId } = await getConnectedShop();
  const [taxonomy, shopSections] = await Promise.all([
    getSellerTaxonomy().catch(() => new Map<number, string>()),
    getShopSections(shopId),
  ]);
  let offset = 0;
  const listings: EtsyListing[] = [];
  do {
    const page = await etsyFetch<{ count: number; results: EtsyListing[] }>(`/shops/${shopId}/listings?state=active&limit=100&offset=${offset}&includes=Images`);
    listings.push(...(page.results || []));
    offset += page.results?.length || 0;
    if (!page.results?.length || offset >= page.count) break;
  } while (offset < 10_000);

  const inventories = await getListingInventories(listings);
  let missingImageCount = 0;
  let variationListingCount = 0;
  let variantCount = 0;
  let variantImageCount = 0;
  for (let index = 0; index < listings.length; index += 4) {
    const listingBatch = listings.slice(index, index + 4);
    const products = await Promise.all(listingBatch.map(async (listing) => ({
      listing,
      product: await listingToProduct(listing, taxonomy, shopSections, inventories.get(listing.listing_id) || null, shopId),
    })));
    for (const { listing, product } of products) {
      if (!product.images.length) missingImageCount++;
      if (product.variants.length) {
        variationListingCount++;
        variantCount += product.variants.length;
        variantImageCount += product.variants.filter((variant) => Boolean(variant.image)).length;
      }
      await upsertImportedProduct(String(listing.listing_id), product);
    }
  }
  console.log(JSON.stringify({ level: "info", message: "Etsy variations mapped", variationListingCount, variantCount, variantImageCount }));
  return { count: listings.length, missingImageCount };
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
