import "server-only";

import { ensureDatabase, getSql } from "./db";
import { encryptionKeyStatus } from "./crypto";
import { getAppliedSchemaVersion, LATEST_SCHEMA_VERSION } from "./migrations";
import { isAuthConfigured } from "./session";
import type { SystemCheck, SystemHealth } from "./types";

function validPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  await ensureDatabase();
  const sql = getSql();
  const settingsRows = await sql`SELECT key, value FROM app_settings WHERE key IN ('site_name', 'public_base_url', 'mode')` as Array<{ key: string; value: string }>;
  const connectionRows = await sql`SELECT provider, status, config_enc, token_enc, last_tested_at FROM connections ORDER BY provider` as Array<{ provider: "etsy" | "square"; status: string; config_enc: string | null; token_enc: string | null; last_tested_at: string | null }>;
  const schemaVersion = await getAppliedSchemaVersion(sql);
  const settings = new Map(settingsRows.map((row) => [row.key, row.value]));
  const connections = new Map(connectionRows.map((row) => [row.provider, row]));
  const key = encryptionKeyStatus();
  const publicUrl = settings.get("public_base_url") || process.env.PUBLIC_APP_URL || "";
  const siteName = settings.get("site_name") || "";
  const etsy = connections.get("etsy");
  const square = connections.get("square");
  const checks: SystemCheck[] = [
    { id: "database", label: "Database", status: "pass", detail: "The database is reachable and ready." },
    {
      id: "migrations",
      label: "Database migrations",
      status: schemaVersion === LATEST_SCHEMA_VERSION ? "pass" : "fail",
      detail: schemaVersion === LATEST_SCHEMA_VERSION ? `Schema version ${schemaVersion} is current.` : `Schema version ${schemaVersion} of ${LATEST_SCHEMA_VERSION} is installed.`,
      action: schemaVersion === LATEST_SCHEMA_VERSION ? undefined : "Redeploy the latest release to apply pending migrations.",
    },
    {
      id: "encryption",
      label: "Credential encryption",
      status: key.valid ? (key.source === "environment" ? "pass" : "warning") : "fail",
      detail: key.valid ? (key.source === "environment" ? "A valid production encryption key is configured." : "A local development key is in use.") : "A valid base64-encoded 32-byte encryption key is required.",
      action: key.valid ? undefined : "Add APP_ENCRYPTION_KEY in the deployment environment and redeploy.",
    },
    {
      id: "login",
      label: "Administrator login",
      status: isAuthConfigured() ? "pass" : "fail",
      detail: isAuthConfigured() ? "Private login and session signing are configured." : "Login environment settings are incomplete.",
      action: isAuthConfigured() ? undefined : "Set ADMIN_USERNAME, ADMIN_PASSWORD, and a 32+ character SESSION_SECRET.",
    },
    {
      id: "public-url",
      label: "Public application URL",
      status: validPublicUrl(publicUrl) ? "pass" : "fail",
      detail: validPublicUrl(publicUrl) ? publicUrl : "The saved public URL is missing or invalid.",
      action: validPublicUrl(publicUrl) ? undefined : "Save the final HTTPS address in Settings.",
    },
    {
      id: "branding",
      label: "Workspace identity",
      status: siteName.trim() ? "pass" : "warning",
      detail: siteName.trim() ? `Workspace name: ${siteName}` : "The workspace still needs a company name.",
      action: siteName.trim() ? undefined : "Add the company name in Settings.",
    },
    {
      id: "etsy",
      label: "Etsy connection",
      status: etsy?.status === "connected" && Boolean(etsy.token_enc) ? "pass" : etsy?.config_enc ? "warning" : "fail",
      detail: etsy?.status === "connected" && etsy.token_enc ? "Etsy OAuth is connected." : etsy?.config_enc ? "Credentials are saved, but OAuth is not connected." : "Etsy credentials have not been saved.",
      action: etsy?.status === "connected" && etsy.token_enc ? undefined : "Save the Etsy app credentials, connect Etsy, and run the connection test.",
    },
    {
      id: "square",
      label: "Square connection",
      status: square?.status === "connected" && Boolean(square.token_enc) ? "pass" : square?.config_enc ? "warning" : "fail",
      detail: square?.status === "connected" && square.token_enc ? "Square OAuth is connected." : square?.config_enc ? "Credentials are saved, but OAuth is not connected." : "Square credentials have not been saved.",
      action: square?.status === "connected" && square.token_enc ? undefined : "Save the Square app credentials, connect Square, and run the connection test.",
    },
  ];
  return { checkedAt: new Date().toISOString(), schemaVersion, latestSchemaVersion: LATEST_SCHEMA_VERSION, checks };
}
