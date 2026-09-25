import "server-only";
import { neon } from "@neondatabase/serverless";
import { runMigrations } from "./migrations";

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
  await runMigrations(getSql());
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
