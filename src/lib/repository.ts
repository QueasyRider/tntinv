import "server-only";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getSql } from "./db";
import { DEFAULT_SITE_NAME } from "./branding";
import { decryptJson, encryptJson } from "./crypto";
import { DEMO_PRODUCTS } from "./demo";
import { buildImportFieldChanges } from "./import-review";
import { mergeImportedProductCopy, productCopiesMatch, rebaseImportedProductCopy } from "./import-merge";
import { duplicateSkuError, hasUnavailableSku, isUnavailableSku, normalizeSkuKey, UNAVAILABLE_SKU_ERROR, UNAVAILABLE_SKU_KEY } from "./sku";
import { normalizeProductText } from "./text-format";
import { getSystemHealth } from "./system-health";
import type { Activity, AppSettings, AppState, ConnectionSummary, ImportChangeReview, ImportChangeType, ImportReviewData, ImportReviewRun, Product, ProductCopy, ProductStatus, Provider, SyncRun, ValidationIssue } from "./types";

interface ProductRow {
  id: string;
  etsy_listing_id: string;
  original_json: string;
  working_json: string;
  status: ProductStatus;
  import_status: string;
  square_item_id: string | null;
  square_version: number | string | null;
  last_error: string | null;
  imported_at: string;
  updated_at: string;
  exported_at: string | null;
}

interface ConnectionRow {
  provider: Provider;
  status: ConnectionSummary["status"];
  account_label: string;
  config_enc: string | null;
  token_enc: string | null;
  last_tested_at: string | null;
  error: string | null;
}

interface ActivityRow {
  id: string;
  kind: Activity["kind"];
  title: string;
  detail: string;
  product_id: string | null;
  created_at: string;
}

interface SyncRunRow {
  id: string;
  direction: string;
  status: string;
  selected_count: number;
  success_count: number;
  error_count: number;
  error_json: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ImportReviewRow {
  id: string;
  sync_run_id: string;
  product_id: string | null;
  etsy_listing_id: string;
  change_type: ImportChangeType;
  before_json: string | null;
  after_json: string | null;
  changed_fields_json: string;
  reviewed: boolean;
  created_at: string;
  reviewed_at: string | null;
}

interface ImportReviewRunRow extends SyncRunRow {
  total_count: number | string;
  new_count: number | string;
  changed_count: number | string;
  unchanged_count: number | string;
  removed_count: number | string;
  unreviewed_count: number | string;
}

export interface EtsyConfig { keystring: string; sharedSecret: string; shopId?: string }
export interface SquareConfig { appId: string; appSecret: string; environment: "sandbox" | "production"; locationId?: string }
export interface ProviderConfigMap { etsy: EtsyConfig; square: SquareConfig }

export interface ProviderToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId?: string;
}

const MAX_SYNC_RUN_HISTORY = 50;

const parseProductCopy = (value: string): ProductCopy => normalizeProductText(JSON.parse(value) as ProductCopy);

const mapProduct = (row: ProductRow): Product => ({
  id: row.id,
  etsyListingId: row.etsy_listing_id,
  original: parseProductCopy(row.original_json),
  working: parseProductCopy(row.working_json),
  status: row.status,
  importStatus: row.import_status,
  squareItemId: row.square_item_id,
  squareVersion: row.square_version === null ? null : Number(row.square_version),
  lastError: row.last_error,
  importedAt: row.imported_at,
  updatedAt: row.updated_at,
  exportedAt: row.exported_at,
});

const mapSyncRun = (row: SyncRunRow): SyncRun => ({
  id: row.id,
  direction: row.direction,
  status: row.status,
  selectedCount: Number(row.selected_count),
  successCount: Number(row.success_count),
  errorCount: Number(row.error_count),
  errors: row.error_json ? JSON.parse(row.error_json) as string[] : [],
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

const parseNullableCopy = (value: string | null): ProductCopy | null => value ? parseProductCopy(value) : null;

const mapImportReviewRun = (row: ImportReviewRunRow): ImportReviewRun => ({
  id: row.id,
  status: row.status,
  selectedCount: Number(row.selected_count),
  successCount: Number(row.success_count),
  errorCount: Number(row.error_count),
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  totalCount: Number(row.total_count),
  newCount: Number(row.new_count),
  changedCount: Number(row.changed_count),
  unchangedCount: Number(row.unchanged_count),
  removedCount: Number(row.removed_count),
  unreviewedCount: Number(row.unreviewed_count),
});

const mapImportReview = (row: ImportReviewRow): ImportChangeReview => {
  const before = parseNullableCopy(row.before_json);
  const after = parseNullableCopy(row.after_json);
  const display = after || before;
  return {
    id: row.id,
    runId: row.sync_run_id,
    productId: row.product_id,
    etsyListingId: row.etsy_listing_id,
    changeType: row.change_type,
    title: display?.title || "Untitled listing",
    sku: display?.sku || "No SKU",
    image: display?.images[0] || null,
    changes: JSON.parse(row.changed_fields_json) as ImportChangeReview["changes"],
    reviewed: Boolean(row.reviewed),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
};

function productSkuKeys(copy: ProductCopy): string[] {
  return [...new Set([copy.sku, ...copy.variants.map((variant) => variant.sku)].map(normalizeSkuKey).filter((sku) => Boolean(sku) && sku !== UNAVAILABLE_SKU_KEY))];
}

let skuIndexPromise: Promise<void> | null = null;

async function ensureSkuIndex(): Promise<void> {
  await ensureDatabase();
  if (!skuIndexPromise) {
    skuIndexPromise = (async () => {
      const sql = getSql();
      await sql`DELETE FROM product_skus WHERE sku_key = ${UNAVAILABLE_SKU_KEY}`;
      await sql`DELETE FROM product_skus WHERE product_id IN (SELECT id FROM products WHERE import_status = 'inactive_on_etsy')`;
      const products = await sql`SELECT id, working_json FROM products WHERE import_status <> 'inactive_on_etsy' ORDER BY updated_at DESC` as Array<{ id: string; working_json: string }>;
      const indexedSkuKeys = new Set<string>();
      for (const product of products) {
        const working = parseProductCopy(product.working_json);
        const skuKeys = productSkuKeys(working);
        for (const skuKey of skuKeys) {
          await sql`INSERT INTO product_skus (sku_key, product_id) VALUES (${skuKey}, ${product.id}) ON CONFLICT (sku_key, product_id) DO NOTHING`;
          indexedSkuKeys.add(skuKey);
        }
      }
      await refreshDuplicateSkuStates([...indexedSkuKeys]);
    })().catch((error) => {
      skuIndexPromise = null;
      throw error;
    });
  }
  await skuIndexPromise;
}

async function findSkuOwnerIds(skuKeys: string[]): Promise<string[]> {
  const sql = getSql();
  const ownerIds = new Set<string>();
  for (const skuKey of skuKeys) {
    const rows = await sql`SELECT product_id FROM product_skus WHERE sku_key = ${skuKey}` as Array<{ product_id: string }>;
    rows.forEach((row) => ownerIds.add(row.product_id));
  }
  return [...ownerIds];
}

async function findProductSkuConflicts(productId: string, copy: ProductCopy): Promise<string[]> {
  const sql = getSql();
  const conflicts: string[] = [];
  for (const skuKey of productSkuKeys(copy)) {
    const rows = await sql`SELECT product_id FROM product_skus WHERE sku_key = ${skuKey} AND product_id <> ${productId} LIMIT 1` as Array<{ product_id: string }>;
    if (rows.length) conflicts.push(skuKey);
  }
  return conflicts;
}

async function refreshDuplicateSkuStates(skuKeys: string[]): Promise<void> {
  const sql = getSql();
  const productIds = await findSkuOwnerIds([...new Set(skuKeys)]);
  for (const productId of productIds) {
    const rows = await sql`SELECT working_json, import_status FROM products WHERE id = ${productId} AND import_status <> 'inactive_on_etsy' LIMIT 1` as Array<{ working_json: string; import_status: string }>;
    if (!rows[0]) continue;
    const working = parseProductCopy(rows[0].working_json);
    if (hasUnavailableSku(working)) {
      await sql`UPDATE products SET status = 'error', import_status = 'sku_error', last_error = ${UNAVAILABLE_SKU_ERROR} WHERE id = ${productId}`;
      continue;
    }
    const error = duplicateSkuError(await findProductSkuConflicts(productId, working));
    if (error) {
      await sql`UPDATE products SET status = 'error', import_status = 'duplicate_sku', last_error = ${error} WHERE id = ${productId}`;
    } else if (rows[0].import_status === "duplicate_sku") {
      await sql`UPDATE products SET status = 'needs_review', import_status = 'reconciled', last_error = NULL WHERE id = ${productId}`;
    }
  }
}

async function replaceSkuIndex(productId: string, copy: ProductCopy): Promise<void> {
  const sql = getSql();
  const previousRows = await sql`SELECT sku_key FROM product_skus WHERE product_id = ${productId}` as Array<{ sku_key: string }>;
  const skuKeys = productSkuKeys(copy);
  await sql`DELETE FROM product_skus WHERE product_id = ${productId}`;
  for (const skuKey of skuKeys) {
    await sql`INSERT INTO product_skus (sku_key, product_id) VALUES (${skuKey}, ${productId}) ON CONFLICT (sku_key, product_id) DO NOTHING`;
  }
  await refreshDuplicateSkuStates([...previousRows.map((row) => row.sku_key), ...skuKeys]);
}

export async function getProductSkuConflictError(productId: string, copy: ProductCopy): Promise<string | null> {
  await ensureSkuIndex();
  return duplicateSkuError(await findProductSkuConflicts(productId, copy));
}

export async function getSettings(): Promise<AppSettings> {
  await ensureDatabase();
  const rows = await getSql()`SELECT key, value FROM app_settings` as Array<{ key: string; value: string }>;
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    siteName: values.get("site_name") || DEFAULT_SITE_NAME,
    mode: (values.get("mode") || "demo") as AppSettings["mode"],
    etsyShopId: values.get("etsy_shop_id") || "",
    squareEnvironment: (values.get("square_environment") || "sandbox") as AppSettings["squareEnvironment"],
    squareLocationId: values.get("square_location_id") || "",
    publicBaseUrl: values.get("public_base_url") || process.env.PUBLIC_APP_URL || "http://localhost:3000",
    setupComplete: values.get("setup_complete") === "true",
  };
}

export async function updateSettings(values: Partial<AppSettings>): Promise<void> {
  await ensureDatabase();
  const sql = getSql();
  const siteName = values.siteName?.trim();
  if (values.siteName !== undefined && !siteName) throw new Error("Company name is required.");
  if (siteName && siteName.length > 80) throw new Error("Company name must be 80 characters or fewer.");
  if (values.publicBaseUrl !== undefined) {
    let url: URL;
    try { url = new URL(values.publicBaseUrl); }
    catch { throw new Error("Public app URL must be a complete URL."); }
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) throw new Error("Public app URL must use HTTPS.");
  }
  const entries: Array<[string, string | undefined]> = [
    ["site_name", siteName],
    ["mode", values.mode],
    ["etsy_shop_id", values.etsyShopId],
    ["square_environment", values.squareEnvironment],
    ["square_location_id", values.squareLocationId],
    ["public_base_url", values.publicBaseUrl],
    ["setup_complete", values.setupComplete === undefined ? undefined : String(values.setupComplete)],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined) await sql`INSERT INTO app_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
}

export async function getProducts(): Promise<Product[]> {
  await ensureDatabase();
  const rows = await getSql()`SELECT * FROM products WHERE import_status <> 'inactive_on_etsy' ORDER BY updated_at DESC` as ProductRow[];
  return rows.map(mapProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  await ensureDatabase();
  const rows = await getSql()`SELECT * FROM products WHERE id = ${id} LIMIT 1` as ProductRow[];
  return rows[0] ? mapProduct(rows[0]) : null;
}

async function recordImportReview(
  runId: string,
  productId: string,
  etsyListingId: string,
  changeType: ImportChangeType,
  before: ProductCopy | null,
  after: ProductCopy | null,
): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();
  const changes = buildImportFieldChanges(before, after);
  await sql`
    INSERT INTO import_change_reviews (
      id, sync_run_id, product_id, etsy_listing_id, change_type,
      before_json, after_json, changed_fields_json, reviewed, created_at, reviewed_at
    ) VALUES (
      ${randomUUID()}, ${runId}, ${productId}, ${etsyListingId}, ${changeType},
      ${before ? JSON.stringify(before) : null}, ${after ? JSON.stringify(after) : null}, ${JSON.stringify(changes)}, FALSE, ${now}, NULL
    )
    ON CONFLICT (sync_run_id, etsy_listing_id) DO UPDATE SET
      product_id = EXCLUDED.product_id,
      change_type = EXCLUDED.change_type,
      before_json = EXCLUDED.before_json,
      after_json = EXCLUDED.after_json,
      changed_fields_json = EXCLUDED.changed_fields_json,
      reviewed = FALSE,
      created_at = EXCLUDED.created_at,
      reviewed_at = NULL
  `;
}

export async function saveProductImage(productId: string, fileName: string, mimeType: string, dataBase64: string): Promise<string> {
  await ensureDatabase();
  const id = randomUUID();
  const rows = await getSql()`
    INSERT INTO product_images (id, product_id, mime_type, file_name, data_base64, created_at)
    SELECT ${id}, id, ${mimeType}, ${fileName}, ${dataBase64}, ${new Date().toISOString()}
    FROM products
    WHERE id = ${productId}
    RETURNING id
  ` as Array<{ id: string }>;
  if (!rows[0]) throw new Error("Product not found.");
  return rows[0].id;
}

export async function getProductImage(id: string): Promise<{ mimeType: string; fileName: string; dataBase64: string } | null> {
  await ensureDatabase();
  const rows = await getSql()`SELECT mime_type, file_name, data_base64 FROM product_images WHERE id = ${id} LIMIT 1` as Array<{ mime_type: string; file_name: string; data_base64: string }>;
  return rows[0] ? { mimeType: rows[0].mime_type, fileName: rows[0].file_name, dataBase64: rows[0].data_base64 } : null;
}

export async function deleteProduct(id: string): Promise<Product> {
  await ensureSkuIndex();
  const sql = getSql();
  const skuRows = await sql`SELECT sku_key FROM product_skus WHERE product_id = ${id}` as Array<{ sku_key: string }>;
  const rows = await sql`DELETE FROM products WHERE id = ${id} RETURNING *` as ProductRow[];
  if (!rows[0]) throw new Error("Product not found.");
  if (skuRows.length) await refreshDuplicateSkuStates(skuRows.map((row) => row.sku_key));
  const product = mapProduct(rows[0]);
  await addActivity("edit", "Product removed from local inventory", `${product.working.title}. Etsy and Square were not changed.`);
  return product;
}

export function validateProduct(copy: ProductCopy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!copy.title.trim()) issues.push({ field: "title", message: "Title is required.", severity: "error" });
  if (!copy.description.trim()) issues.push({ field: "description", message: "Description is required.", severity: "error" });
  if (!copy.sku.trim()) issues.push({ field: "sku", message: "SKU is required.", severity: "error" });
  if (hasUnavailableSku(copy)) issues.push({ field: "sku", message: UNAVAILABLE_SKU_ERROR, severity: "error" });
  if (copy.priceCents < 0) issues.push({ field: "price", message: "Price cannot be negative.", severity: "error" });
  if (copy.quantity < 0) issues.push({ field: "quantity", message: "Quantity cannot be negative.", severity: "error" });
  if (!copy.category.trim()) issues.push({ field: "category", message: "Choose a Square-ready category.", severity: "error" });
  const skus = new Set<string>();
  for (const variant of copy.variants) {
    if (!variant.sku.trim()) issues.push({ field: "variants", message: `${variant.name || "Variant"} needs a SKU.`, severity: "error" });
    const skuKey = normalizeSkuKey(variant.sku);
    if (!isUnavailableSku(variant.sku)) {
      if (skuKey && skus.has(skuKey)) issues.push({ field: "variants", message: `Duplicate variant SKU: ${variant.sku}.`, severity: "error" });
      if (skuKey) skus.add(skuKey);
    }
    if (variant.quantity < 0 || variant.priceCents < 0) issues.push({ field: "variants", message: `${variant.name || "Variant"} has an invalid price or quantity.`, severity: "error" });
  }
  return issues;
}

export async function upsertImportedProduct(etsyListingId: string, original: ProductCopy, preferredStatus: ProductStatus = "needs_review", importRunId?: string): Promise<Product> {
  await ensureSkuIndex();
  const sql = getSql();
  const listingRows = await sql`SELECT * FROM products WHERE etsy_listing_id = ${etsyListingId} LIMIT 1` as ProductRow[];
  const existing = listingRows[0];
  const now = new Date().toISOString();
  if (existing) {
    const existingOriginal = parseProductCopy(existing.original_json);
    const existingWorking = parseProductCopy(existing.working_json);
    const repairLegacyRefresh = existing.import_status === "refreshed";
    const working = repairLegacyRefresh
      ? rebaseImportedProductCopy(original, existingWorking)
      : mergeImportedProductCopy(etsyListingId, existingOriginal, existingWorking, original);
    const workingChanged = !productCopiesMatch(existingWorking, working);
    const skuError = hasUnavailableSku(working) ? UNAVAILABLE_SKU_ERROR : null;
    const nextStatus = skuError ? "error" : workingChanged ? preferredStatus : existing.status;
    const nextError = skuError || (workingChanged ? null : existing.last_error);
    const importStatus = skuError ? "sku_error" : "reconciled";
    await sql`
      UPDATE products
      SET etsy_listing_id = ${etsyListingId},
          original_json = ${JSON.stringify(original)},
          working_json = ${JSON.stringify(working)},
          status = ${nextStatus},
          import_status = ${importStatus},
          last_error = ${nextError},
          imported_at = ${now},
          updated_at = ${now}
      WHERE id = ${existing.id}
    `;
    await replaceSkuIndex(existing.id, working);
    if (importRunId) await recordImportReview(importRunId, existing.id, etsyListingId, productCopiesMatch(existingOriginal, original) ? "unchanged" : "changed", existingOriginal, original);
    return (await getProduct(existing.id))!;
  }
  const id = randomUUID();
  const originalJson = JSON.stringify(original);
  const skuError = hasUnavailableSku(original) ? UNAVAILABLE_SKU_ERROR : null;
  await sql`INSERT INTO products (id, etsy_listing_id, original_json, working_json, status, import_status, last_error, imported_at, updated_at) VALUES (${id}, ${etsyListingId}, ${originalJson}, ${originalJson}, ${skuError ? "error" : preferredStatus}, ${skuError ? "sku_error" : "imported"}, ${skuError}, ${now}, ${now})`;
  await replaceSkuIndex(id, original);
  if (importRunId) await recordImportReview(importRunId, id, etsyListingId, "new", null, original);
  return (await getProduct(id))!;
}

export async function saveProduct(id: string, working: ProductCopy, markReady = false): Promise<Product> {
  const issues = validateProduct(working);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const skuError = hasUnavailableSku(working) ? UNAVAILABLE_SKU_ERROR : null;
  const duplicateSkuErrors = issues.filter((issue) => issue.severity === "error" && issue.message.startsWith("Duplicate variant SKU:"));
  if (duplicateSkuErrors.length) throw new Error(duplicateSkuErrors.map((issue) => issue.message).join(" "));
  await ensureSkuIndex();
  const crossProductSkuError = await getProductSkuConflictError(id, working);
  const nextSkuError = skuError || crossProductSkuError;
  if (markReady && (hasErrors || nextSkuError)) {
    const messages = [...issues.filter((issue) => issue.severity === "error").map((issue) => issue.message), ...(nextSkuError ? [nextSkuError] : [])];
    throw new Error([...new Set(messages)].join(" "));
  }
  const status: ProductStatus = nextSkuError ? "error" : markReady ? "ready" : "needs_review";
  const now = new Date().toISOString();
  const importStatus = nextSkuError ? (skuError ? "sku_error" : "duplicate_sku") : "reconciled";
  const rows = await getSql()`UPDATE products SET working_json = ${JSON.stringify(working)}, status = ${status}, import_status = ${importStatus}, last_error = ${nextSkuError}, updated_at = ${now} WHERE id = ${id} RETURNING id` as Array<{ id: string }>;
  if (!rows.length) throw new Error("Product not found.");
  await replaceSkuIndex(id, working);
  await addActivity(markReady ? "ready" : "edit", markReady ? "Product marked ready" : "Working copy saved", working.title, id);
  return (await getProduct(id))!;
}

export async function bulkUpdate(ids: string[], operation: { type: string; value?: string; value2?: string }): Promise<number> {
  await ensureSkuIndex();
  let changed = 0;
  const sql = getSql();
  for (const id of ids) {
    const product = await getProduct(id);
    if (!product) continue;
    const next = structuredClone(product.working);
    if (operation.type === "price_percent") {
      const multiplier = 1 + Number(operation.value || 0) / 100;
      next.priceCents = Math.max(0, Math.round(next.priceCents * multiplier));
      next.variants = next.variants.map((variant) => ({ ...variant, priceCents: Math.max(0, Math.round(variant.priceCents * multiplier)) }));
    } else if (operation.type === "category") next.category = operation.value?.trim() || next.category;
    else if (operation.type === "quantity") {
      next.quantity = Math.max(0, Number(operation.value || 0));
      if (next.variants.length === 1) next.variants[0].quantity = next.quantity;
    } else if (operation.type === "find_replace" && operation.value) {
      next.title = next.title.split(operation.value).join(operation.value2 || "");
      next.description = next.description.split(operation.value).join(operation.value2 || "");
    }
    const skuError = hasUnavailableSku(next) ? UNAVAILABLE_SKU_ERROR : await getProductSkuConflictError(id, next);
    const importStatus = skuError ? (hasUnavailableSku(next) ? "sku_error" : "duplicate_sku") : "reconciled";
    await sql`UPDATE products SET working_json = ${JSON.stringify(next)}, status = ${skuError ? "error" : "needs_review"}, import_status = ${importStatus}, last_error = ${skuError}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
    changed++;
  }
  await addActivity("edit", `Bulk edit applied to ${changed} product${changed === 1 ? "" : "s"}`, operation.type.replaceAll("_", " "));
  return changed;
}

export async function markExported(id: string, squareItemId: string, squareVersion: number | null, working: ProductCopy): Promise<void> {
  await ensureDatabase();
  const now = new Date().toISOString();
  await getSql()`UPDATE products SET working_json = ${JSON.stringify(working)}, status = 'exported', square_item_id = ${squareItemId}, square_version = ${squareVersion}, last_error = NULL, exported_at = ${now}, updated_at = ${now} WHERE id = ${id}`;
}

export async function saveSquareCatalogMapping(id: string, squareItemId: string, squareVersion: number | null, working: ProductCopy): Promise<void> {
  await ensureDatabase();
  await getSql()`UPDATE products SET working_json = ${JSON.stringify(working)}, square_item_id = ${squareItemId}, square_version = ${squareVersion}, last_error = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
}

export async function markExportError(id: string, error: string): Promise<void> {
  await ensureDatabase();
  await getSql()`UPDATE products SET status = 'error', last_error = ${error}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`;
}

export async function addActivity(kind: Activity["kind"], title: string, detail = "", productId: string | null = null): Promise<void> {
  await ensureDatabase();
  await getSql()`INSERT INTO activities (id, kind, title, detail, product_id, created_at) VALUES (${randomUUID()}, ${kind}, ${title}, ${detail}, ${productId}, ${new Date().toISOString()})`;
}

export async function seedDemoProducts(importRunId?: string): Promise<number> {
  let count = 0;
  const sql = getSql();
  for (const seed of DEMO_PRODUCTS) {
    const product = await upsertImportedProduct(seed.etsyListingId, seed.original, seed.status, importRunId);
    const working = { ...seed.original, ...seed.working, variants: seed.working?.variants ?? seed.original.variants };
    await sql`UPDATE products SET working_json = ${JSON.stringify(working)}, status = ${seed.status}, import_status = 'demo', square_item_id = ${seed.squareItemId ?? null}, last_error = ${seed.lastError ?? null}, exported_at = ${seed.status === "exported" ? new Date().toISOString() : null} WHERE id = ${product.id}`;
    count++;
  }
  await addActivity("import", `Imported ${count} products from Etsy`, "Demo data refreshed safely into the local working copy.");
  return count;
}

export async function clearDemoProducts(): Promise<void> {
  await ensureDatabase();
  const sql = getSql();
  for (const seed of DEMO_PRODUCTS) {
    await sql`DELETE FROM products WHERE etsy_listing_id = ${seed.etsyListingId} AND (import_status = 'demo' OR original_json LIKE '%/products/%')`;
  }
}

export function getConnection(provider: "etsy"): Promise<{ summary: ConnectionSummary; config: EtsyConfig | null; token: ProviderToken | null }>;
export function getConnection(provider: "square"): Promise<{ summary: ConnectionSummary; config: SquareConfig | null; token: ProviderToken | null }>;
export async function getConnection(provider: Provider): Promise<{ summary: ConnectionSummary; config: EtsyConfig | SquareConfig | null; token: ProviderToken | null }> {
  await ensureDatabase();
  const rows = await getSql()`SELECT * FROM connections WHERE provider = ${provider} LIMIT 1` as ConnectionRow[];
  const row = rows[0];
  if (!row) throw new Error(`${provider} connection record is missing.`);
  return {
    summary: { provider, status: row.status, accountLabel: row.account_label, lastTestedAt: row.last_tested_at, error: row.error, hasCredentials: Boolean(row.config_enc) },
    config: decryptJson<EtsyConfig | SquareConfig>(row.config_enc),
    token: decryptJson<ProviderToken>(row.token_enc),
  };
}

export async function saveConnectionConfig<P extends Provider>(provider: P, config: ProviderConfigMap[P], accountLabel: string): Promise<void> {
  await ensureDatabase();
  await getSql()`UPDATE connections SET status = 'configured', account_label = ${accountLabel}, config_enc = ${encryptJson(config)}, token_enc = NULL, error = NULL, updated_at = ${new Date().toISOString()} WHERE provider = ${provider}`;
}

export async function saveConnectionToken(provider: Provider, token: ProviderToken, accountLabel: string, recordActivity = true): Promise<void> {
  await ensureDatabase();
  await getSql()`UPDATE connections SET status = 'connected', account_label = ${accountLabel}, token_enc = ${encryptJson(token)}, error = NULL, updated_at = ${new Date().toISOString()} WHERE provider = ${provider}`;
  if (recordActivity) await addActivity("connection", `${provider === "etsy" ? "Etsy" : "Square"} connected`, accountLabel);
}

export async function updateConnectionTest(provider: Provider, success: boolean, label: string, error: string | null = null): Promise<void> {
  await ensureDatabase();
  await getSql()`UPDATE connections SET status = ${success ? "connected" : "error"}, account_label = ${label}, last_tested_at = ${new Date().toISOString()}, error = ${error}, updated_at = ${new Date().toISOString()} WHERE provider = ${provider}`;
}

export async function getAppState(): Promise<AppState> {
  await ensureDatabase();
  await pruneSyncRunHistory();
  const settings = await getSettings();
  const countRows = await getSql()`SELECT COUNT(*)::int AS count FROM products` as Array<{ count: number }>;
  if (settings.mode === "demo" && !Number(countRows[0]?.count || 0)) await seedDemoProducts();
  const activityPromise = (async () => await getSql()`SELECT id, kind, title, detail, product_id, created_at FROM activities ORDER BY created_at DESC LIMIT 40` as ActivityRow[])();
  const syncPromise = (async () => await getSql()`SELECT id, direction, status, selected_count, success_count, error_count, error_json, started_at, finished_at FROM sync_runs ORDER BY started_at DESC LIMIT ${MAX_SYNC_RUN_HISTORY}` as SyncRunRow[])();
  const [products, activityRows, syncRows, etsy, square, systemHealth] = await Promise.all([
    getProducts(),
    activityPromise,
    syncPromise,
    getConnection("etsy"),
    getConnection("square"),
    getSystemHealth(),
  ]);
  const activities = activityRows.map((row): Activity => ({ id: row.id, kind: row.kind, title: row.title, detail: row.detail, productId: row.product_id, createdAt: row.created_at }));
  const syncRuns = syncRows.map(mapSyncRun);
  return {
    products,
    activities,
    syncRuns,
    connections: { etsy: etsy.summary, square: square.summary },
    settings,
    systemHealth,
    metrics: {
      imported: products.length,
      ready: products.filter((product) => product.status === "ready").length,
      exported: products.filter((product) => product.status === "exported").length,
      errors: products.filter((product) => product.status === "error").length,
    },
  };
}

export async function clearConnection(provider: Provider): Promise<void> {
  await ensureDatabase();
  await getSql()`
    UPDATE connections
    SET status = 'demo', account_label = ${provider === "etsy" ? "Etsy not configured" : "Square not configured"},
        config_enc = NULL, token_enc = NULL, last_tested_at = NULL, error = NULL, updated_at = ${new Date().toISOString()}
    WHERE provider = ${provider}
  `;
  await addActivity("connection", `${provider === "etsy" ? "Etsy" : "Square"} connection cleared`, "Saved credentials and OAuth tokens were removed.");
}

async function pruneSyncRunHistory(): Promise<void> {
  await getSql()`
    DELETE FROM sync_runs
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id, status, ROW_NUMBER() OVER (ORDER BY started_at DESC, id DESC) AS history_position
        FROM sync_runs
      ) ranked_runs
      WHERE history_position > ${MAX_SYNC_RUN_HISTORY}
        AND status <> 'running'
    )
  `;
}

export async function startSyncRun(direction: string, selectedCount: number): Promise<{ id: string; idempotencyKey: string }> {
  await ensureDatabase();
  const id = randomUUID();
  const idempotencyKey = randomUUID();
  await getSql()`INSERT INTO sync_runs (id, direction, status, selected_count, idempotency_key, started_at) VALUES (${id}, ${direction}, 'running', ${selectedCount}, ${idempotencyKey}, ${new Date().toISOString()})`;
  await pruneSyncRunHistory();
  return { id, idempotencyKey };
}

export async function finishSyncRun(id: string, success: number, errors: string[]): Promise<void> {
  await ensureDatabase();
  const status = errors.length ? (success ? "partial" : "failed") : "completed";
  await getSql()`UPDATE sync_runs SET status = ${status}, success_count = ${success}, error_count = ${errors.length}, error_json = ${errors.length ? JSON.stringify(errors) : null}, finished_at = ${new Date().toISOString()} WHERE id = ${id}`;
  await pruneSyncRunHistory();
}

export async function updateSyncRunProgress(id: string, selectedCount: number, successDelta: number): Promise<number> {
  await ensureDatabase();
  const rows = await getSql()`
    UPDATE sync_runs
    SET selected_count = ${selectedCount}, success_count = success_count + ${successDelta}
    WHERE id = ${id} AND status = 'running'
    RETURNING success_count
  ` as Array<{ success_count: number }>;
  if (!rows[0]) throw new Error("This import session is no longer active. Start the Etsy import again.");
  return Number(rows[0].success_count);
}

export async function hideProductsNotSeenDuringImport(id: string): Promise<number> {
  await ensureDatabase();
  const sql = getSql();
  const runs = await sql`
    SELECT started_at
    FROM sync_runs
    WHERE id = ${id} AND direction = 'etsy_to_local' AND status = 'running'
    LIMIT 1
  ` as Array<{ started_at: string }>;
  if (!runs[0]) throw new Error("This import session is no longer active. Start the Etsy import again.");
  const rows = await sql`
    UPDATE products
    SET import_status = 'inactive_on_etsy', updated_at = ${new Date().toISOString()}
    WHERE imported_at < ${runs[0].started_at}
      AND import_status <> 'inactive_on_etsy'
    RETURNING id, etsy_listing_id, original_json
  ` as Array<{ id: string; etsy_listing_id: string; original_json: string }>;
  const affectedSkuKeys = new Set<string>();
  for (const row of rows) {
    const original = parseProductCopy(row.original_json);
    await recordImportReview(id, row.id, row.etsy_listing_id, "removed", original, null);
    const skuRows = await sql`SELECT sku_key FROM product_skus WHERE product_id = ${row.id}` as Array<{ sku_key: string }>;
    skuRows.forEach((skuRow) => affectedSkuKeys.add(skuRow.sku_key));
    await sql`DELETE FROM product_skus WHERE product_id = ${row.id}`;
  }
  if (affectedSkuKeys.size) await refreshDuplicateSkuStates([...affectedSkuKeys]);
  return rows.length;
}

export async function failSyncRun(id: string, error: string): Promise<void> {
  await ensureDatabase();
  await getSql()`
    UPDATE sync_runs
    SET status = CASE WHEN success_count > 0 THEN 'partial' ELSE 'failed' END,
        error_count = 1,
        error_json = ${JSON.stringify([error])},
        finished_at = ${new Date().toISOString()}
    WHERE id = ${id} AND status = 'running'
  `;
  await pruneSyncRunHistory();
}

export async function getSyncRuns(): Promise<SyncRun[]> {
  await ensureDatabase();
  await pruneSyncRunHistory();
  const rows = await getSql()`SELECT id, direction, status, selected_count, success_count, error_count, error_json, started_at, finished_at FROM sync_runs ORDER BY started_at DESC LIMIT ${MAX_SYNC_RUN_HISTORY}` as SyncRunRow[];
  return rows.map(mapSyncRun);
}

export async function getImportReviewData(requestedRunId?: string): Promise<ImportReviewData> {
  await ensureDatabase();
  const sql = getSql();
  const runRows = await sql`
    SELECT
      sr.id, sr.direction, sr.status, sr.selected_count, sr.success_count, sr.error_count,
      sr.error_json, sr.started_at, sr.finished_at,
      COUNT(icr.id)::int AS total_count,
      COUNT(icr.id) FILTER (WHERE icr.change_type = 'new')::int AS new_count,
      COUNT(icr.id) FILTER (WHERE icr.change_type = 'changed')::int AS changed_count,
      COUNT(icr.id) FILTER (WHERE icr.change_type = 'unchanged')::int AS unchanged_count,
      COUNT(icr.id) FILTER (WHERE icr.change_type = 'removed')::int AS removed_count,
      COUNT(icr.id) FILTER (WHERE icr.reviewed = FALSE AND icr.change_type <> 'unchanged')::int AS unreviewed_count
    FROM sync_runs sr
    LEFT JOIN import_change_reviews icr ON icr.sync_run_id = sr.id
    WHERE sr.direction = 'etsy_to_local'
    GROUP BY sr.id, sr.direction, sr.status, sr.selected_count, sr.success_count, sr.error_count, sr.error_json, sr.started_at, sr.finished_at
    ORDER BY sr.started_at DESC
    LIMIT 20
  ` as ImportReviewRunRow[];
  const runs = runRows.map(mapImportReviewRun);
  const selectedRunId = requestedRunId && runs.some((run) => run.id === requestedRunId) ? requestedRunId : runs[0]?.id || null;
  if (!selectedRunId) return { runs, selectedRunId: null, reviews: [] };
  const reviewRows = await sql`
    SELECT id, sync_run_id, product_id, etsy_listing_id, change_type, before_json, after_json,
           changed_fields_json, reviewed, created_at, reviewed_at
    FROM import_change_reviews
    WHERE sync_run_id = ${selectedRunId}
    ORDER BY
      CASE change_type WHEN 'changed' THEN 1 WHEN 'new' THEN 2 WHEN 'removed' THEN 3 ELSE 4 END,
      created_at DESC
  ` as ImportReviewRow[];
  return { runs, selectedRunId, reviews: reviewRows.map(mapImportReview) };
}

export async function markImportReviewsReviewed(runId: string, reviewId?: string): Promise<number> {
  await ensureDatabase();
  const now = new Date().toISOString();
  const rows = reviewId
    ? await getSql()`UPDATE import_change_reviews SET reviewed = TRUE, reviewed_at = ${now} WHERE sync_run_id = ${runId} AND id = ${reviewId} RETURNING id` as Array<{ id: string }>
    : await getSql()`UPDATE import_change_reviews SET reviewed = TRUE, reviewed_at = ${now} WHERE sync_run_id = ${runId} AND change_type <> 'unchanged' AND reviewed = FALSE RETURNING id` as Array<{ id: string }>;
  return rows.length;
}

export async function saveOauthState(provider: Provider, state: string, verifierEnc: string | null, expiresAt: string): Promise<void> {
  await ensureDatabase();
  await getSql()`INSERT INTO oauth_states (state, provider, verifier_enc, expires_at) VALUES (${state}, ${provider}, ${verifierEnc}, ${expiresAt}) ON CONFLICT (state) DO UPDATE SET provider = EXCLUDED.provider, verifier_enc = EXCLUDED.verifier_enc, expires_at = EXCLUDED.expires_at`;
}

export async function getOauthState(provider: Provider, state: string): Promise<{ verifierEnc: string | null; expiresAt: string } | null> {
  await ensureDatabase();
  const rows = await getSql()`SELECT verifier_enc, expires_at FROM oauth_states WHERE state = ${state} AND provider = ${provider} LIMIT 1` as Array<{ verifier_enc: string | null; expires_at: string }>;
  return rows[0] ? { verifierEnc: rows[0].verifier_enc, expiresAt: rows[0].expires_at } : null;
}

export async function deleteOauthState(state: string): Promise<void> {
  await ensureDatabase();
  await getSql()`DELETE FROM oauth_states WHERE state = ${state}`;
}
