export type Provider = "etsy" | "square";
export type ProductStatus = "ready" | "needs_review" | "exported" | "error";

export interface Variant {
  id: string;
  etsyProductId?: string;
  name: string;
  optionName: string;
  optionValue: string;
  sku: string;
  priceCents: number;
  quantity: number;
  image?: string;
  squareVariationId?: string | null;
}

export interface ProductCopy {
  title: string;
  description: string;
  priceCents: number;
  sku: string;
  category: string;
  shopSection?: string;
  etsyTaxonomy?: string;
  squareCategoryId?: string;
  isTaxable: boolean;
  tags: string[];
  quantity: number;
  state: string;
  images: string[];
  variants: Variant[];
}

export interface Product {
  id: string;
  etsyListingId: string;
  original: ProductCopy;
  working: ProductCopy;
  status: ProductStatus;
  importStatus: string;
  squareItemId: string | null;
  squareVersion: number | null;
  lastError: string | null;
  importedAt: string;
  updatedAt: string;
  exportedAt: string | null;
}

export interface Activity {
  id: string;
  kind: "import" | "edit" | "ready" | "export" | "error" | "connection";
  title: string;
  detail: string;
  productId: string | null;
  createdAt: string;
}

export interface ConnectionSummary {
  provider: Provider;
  status: "demo" | "configured" | "connected" | "error";
  accountLabel: string;
  lastTestedAt: string | null;
  error: string | null;
  hasCredentials: boolean;
}

export interface AppSettings {
  siteName: string;
  mode: "demo" | "live";
  etsyShopId: string;
  squareEnvironment: "sandbox" | "production";
  squareLocationId: string;
  publicBaseUrl: string;
  setupComplete: boolean;
}

export interface SystemCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
  action?: string;
}

export interface SystemHealth {
  checkedAt: string;
  schemaVersion: number;
  latestSchemaVersion: number;
  checks: SystemCheck[];
}

export interface AppState {
  products: Product[];
  activities: Activity[];
  syncRuns: SyncRun[];
  connections: Record<Provider, ConnectionSummary>;
  settings: AppSettings;
  systemHealth: SystemHealth;
  metrics: { imported: number; ready: number; exported: number; errors: number };
}

export interface SyncRun {
  id: string;
  direction: string;
  status: string;
  selectedCount: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export type ImportChangeType = "new" | "changed" | "unchanged" | "removed";

export interface ImportFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface ImportChangeReview {
  id: string;
  runId: string;
  productId: string | null;
  etsyListingId: string;
  changeType: ImportChangeType;
  title: string;
  sku: string;
  image: string | null;
  changes: ImportFieldChange[];
  reviewed: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ImportReviewRun {
  id: string;
  status: string;
  selectedCount: number;
  successCount: number;
  errorCount: number;
  startedAt: string;
  finishedAt: string | null;
  totalCount: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  removedCount: number;
  unreviewedCount: number;
}

export interface ImportReviewData {
  runs: ImportReviewRun[];
  selectedRunId: string | null;
  reviews: ImportChangeReview[];
}
