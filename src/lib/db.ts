import "server-only";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_SITE_NAME } from "./branding";

let client: ReturnType<typeof neon> | null = null;
let schemaPromise: Promise<void> | null = null;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!value) throw new Error("DATABASE_URL is not configured. Connect the Neon database to this Vercel project.");
  return value;
}

export function getSql(): ReturnType<typeof neon> {
  if (!client) client = neon(databaseUrl());
  return client;
}

async function initializeDatabase(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      etsy_listing_id TEXT NOT NULL UNIQUE,
      original_json TEXT NOT NULL,
      working_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'needs_review',
      import_status TEXT NOT NULL DEFAULT 'imported',
      square_item_id TEXT,
      square_version BIGINT,
      last_error TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      exported_at TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS connections (
      provider TEXT PRIMARY KEY CHECK(provider IN ('etsy', 'square')),
      status TEXT NOT NULL DEFAULT 'demo',
      account_label TEXT NOT NULL DEFAULT '',
      config_enc TEXT,
      token_enc TEXT,
      last_tested_at TEXT,
      error TEXT,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS product_skus (
      sku_key TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE
    )
  `;
  await sql`ALTER TABLE product_skus DROP CONSTRAINT IF EXISTS product_skus_pkey`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS product_skus_sku_product_idx ON product_skus(sku_key, product_id)`;
  await sql`CREATE INDEX IF NOT EXISTS product_skus_product_id_idx ON product_skus(product_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images(product_id)`;
  await sql`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      selected_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      error_json TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS import_change_reviews (
      id TEXT PRIMARY KEY,
      sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      etsy_listing_id TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('new', 'changed', 'unchanged', 'removed')),
      before_json TEXT,
      after_json TEXT,
      changed_fields_json TEXT NOT NULL DEFAULT '[]',
      reviewed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS import_change_reviews_run_listing_idx ON import_change_reviews(sync_run_id, etsy_listing_id)`;
  await sql`CREATE INDEX IF NOT EXISTS import_change_reviews_run_idx ON import_change_reviews(sync_run_id, reviewed, change_type)`;
  await sql`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      verifier_enc TEXT,
      expires_at TEXT NOT NULL
    )
  `;

  const now = new Date().toISOString();
  await sql`INSERT INTO connections (provider, status, account_label, updated_at) VALUES ('etsy', 'demo', 'Demo Etsy shop', ${now}) ON CONFLICT (provider) DO NOTHING`;
  await sql`INSERT INTO connections (provider, status, account_label, updated_at) VALUES ('square', 'demo', 'Demo Square catalog', ${now}) ON CONFLICT (provider) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('mode', 'demo') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('site_name', ${DEFAULT_SITE_NAME}) ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('etsy_shop_id', '') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('square_environment', 'sandbox') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('square_location_id', '') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO app_settings (key, value) VALUES ('public_base_url', ${process.env.PUBLIC_APP_URL || "https://inventory.twistedandthrifted.com"}) ON CONFLICT (key) DO NOTHING`;
}

export async function ensureDatabase(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initializeDatabase().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}
