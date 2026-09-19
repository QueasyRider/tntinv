import { hasUnavailableSku, isUnavailableSku, normalizeSkuKey } from "./sku";
import type { Product, ProductCopy } from "./types";

export type PreflightSeverity = "error" | "warning";
export type PreflightReadiness = "blocked" | "warning" | "ready" | "synced";

export interface PreflightIssue {
  id: string;
  field: string;
  label: string;
  message: string;
  severity: PreflightSeverity;
}

export interface PreflightReport {
  product: Product;
  issues: PreflightIssue[];
  errorCount: number;
  warningCount: number;
  readiness: PreflightReadiness;
}

export interface PreflightSummary {
  blockingIssues: number;
  warnings: number;
  blockedProducts: number;
  attentionProducts: number;
  clearProducts: number;
  readyProducts: number;
  syncedProducts: number;
}

function productSkuKeys(copy: ProductCopy): string[] {
  return [...new Set([copy.sku, ...copy.variants.map((variant) => variant.sku)]
    .map(normalizeSkuKey)
    .filter((sku) => Boolean(sku) && !isUnavailableSku(sku)))];
}

function duplicateOwners(products: Product[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const product of products) {
    for (const sku of productSkuKeys(product.working)) {
      const ids = owners.get(sku) || new Set<string>();
      ids.add(product.id);
      owners.set(sku, ids);
    }
  }
  return owners;
}

function copyIssues(product: Product, skuOwners: Map<string, Set<string>>): PreflightIssue[] {
  const copy = product.working;
  const issues: PreflightIssue[] = [];
  const messages = new Set<string>();
  const add = (issue: PreflightIssue) => {
    const key = `${issue.severity}:${issue.message.trim().toLowerCase()}`;
    if (!messages.has(key)) {
      messages.add(key);
      issues.push(issue);
    }
  };

  if (!copy.title.trim()) add({ id: "missing-title", field: "title", label: "Title", message: "Add a product title.", severity: "error" });
  if (!copy.description.trim()) add({ id: "missing-description", field: "description", label: "Description", message: "Add a product description.", severity: "error" });
  if (!copy.sku.trim()) add({ id: "missing-sku", field: "sku", label: "SKU", message: "Add a unique SKU.", severity: "error" });
  if (hasUnavailableSku(copy)) add({ id: "unavailable-sku", field: "sku", label: "SKU", message: "Replace unavailable_sku with a real, unique SKU.", severity: "error" });

  if (!Number.isFinite(copy.priceCents) || copy.priceCents < 0) add({ id: "invalid-price", field: "price", label: "Price", message: "Enter a valid price that is not negative.", severity: "error" });
  else if (copy.priceCents === 0) add({ id: "zero-price", field: "price", label: "Price", message: "Price is $0.00. Confirm that this is intentional.", severity: "warning" });

  if (!Number.isFinite(copy.quantity) || copy.quantity < 0) add({ id: "invalid-quantity", field: "quantity", label: "Quantity", message: "Enter a valid quantity that is not negative.", severity: "error" });
  if (!copy.category.trim() || /^unmapped(?:\s+etsy)?\s+category$/i.test(copy.category.trim())) {
    add({ id: "missing-category", field: "category", label: "Category", message: "Choose an existing Square category.", severity: "error" });
  }
  if (!copy.images.some((image) => image.trim())) add({ id: "missing-images", field: "images", label: "Images", message: "No product photo will be sent to Square.", severity: "warning" });
  if (copy.images.length > 250) add({ id: "too-many-images", field: "images", label: "Images", message: "Reduce the listing to 250 photos or fewer.", severity: "error" });

  const variantSkus = new Map<string, number>();
  for (const variant of copy.variants) {
    const variantLabel = variant.name.trim() || variant.optionValue.trim() || "A variant";
    if (!variant.name.trim() || !variant.optionValue.trim()) add({ id: `variant-name-${variant.id}`, field: "variants", label: "Variant", message: `${variantLabel} needs an option value.`, severity: "error" });
    if (!variant.sku.trim()) add({ id: `variant-sku-${variant.id}`, field: "variants", label: "Variant SKU", message: `${variantLabel} needs a SKU.`, severity: "error" });
    if (isUnavailableSku(variant.sku)) add({ id: `variant-unavailable-sku-${variant.id}`, field: "variants", label: "Variant SKU", message: `${variantLabel} has unavailable_sku. Replace it with a unique SKU.`, severity: "error" });
    const sku = normalizeSkuKey(variant.sku);
    if (sku && !isUnavailableSku(sku)) variantSkus.set(sku, (variantSkus.get(sku) || 0) + 1);
    if (!Number.isFinite(variant.priceCents) || variant.priceCents < 0) add({ id: `variant-price-${variant.id}`, field: "variants", label: "Variant price", message: `${variantLabel} has an invalid price.`, severity: "error" });
    if (!Number.isFinite(variant.quantity) || variant.quantity < 0) add({ id: `variant-quantity-${variant.id}`, field: "variants", label: "Variant quantity", message: `${variantLabel} has an invalid quantity.`, severity: "error" });
  }
  for (const [sku, count] of variantSkus) {
    if (count > 1) add({ id: `duplicate-variant-${sku}`, field: "variants", label: "Duplicate SKU", message: `Variant SKU ${sku} appears ${count} times in this product.`, severity: "error" });
  }

  const sharedSkus = productSkuKeys(copy).filter((sku) => (skuOwners.get(sku)?.size || 0) > 1);
  if (sharedSkus.length) add({ id: "duplicate-product-sku", field: "sku", label: "Duplicate SKU", message: `${sharedSkus.join(", ")} ${sharedSkus.length === 1 ? "is" : "are"} also used by another product.`, severity: "error" });

  const effectiveQuantity = copy.variants.length
    ? copy.variants.reduce((total, variant) => total + (Number.isFinite(variant.quantity) ? variant.quantity : 0), 0)
    : copy.quantity;
  if (effectiveQuantity === 0) add({ id: "out-of-stock", field: "quantity", label: "Inventory", message: "Total inventory is zero. The item will be out of stock in Square.", severity: "warning" });

  const recordedErrorIsCovered = Boolean(product.lastError) && (
    (hasUnavailableSku(copy) && /unavailable_sku/i.test(product.lastError || ""))
    || (sharedSkus.length > 0 && /duplicate\s+sku/i.test(product.lastError || ""))
    || issues.some((issue) => issue.severity === "error" && issue.message.trim().toLowerCase() === product.lastError?.trim().toLowerCase())
  );
  if (product.status === "error" && product.lastError && !recordedErrorIsCovered) add({ id: "recorded-error", field: "product", label: "Previous error", message: `Last attempt: ${product.lastError}`, severity: "warning" });
  else if (product.status === "error" && !product.lastError) add({ id: "recorded-error", field: "product", label: "Previous error", message: "This product was marked as an error. Review it before retrying.", severity: "warning" });
  if (product.status === "exported" && !product.squareItemId) add({ id: "missing-square-mapping", field: "square", label: "Square mapping", message: "The exported product is missing its Square item ID.", severity: "error" });
  if (product.status === "needs_review" && !issues.some((issue) => issue.severity === "error")) {
    add({ id: "review-required", field: "product", label: "Review", message: "Review the working copy and mark it ready before export.", severity: "warning" });
  }

  return issues;
}

export function buildPreflightReports(products: Product[]): PreflightReport[] {
  const skuOwners = duplicateOwners(products);
  return products.map((product) => {
    const issues = copyIssues(product, skuOwners);
    const errorCount = issues.filter((issue) => issue.severity === "error").length;
    const warningCount = issues.length - errorCount;
    const readiness: PreflightReadiness = errorCount
      ? "blocked"
      : warningCount
        ? "warning"
        : product.status === "exported"
          ? "synced"
          : "ready";
    return { product, issues, errorCount, warningCount, readiness };
  });
}

export function summarizePreflight(reports: PreflightReport[]): PreflightSummary {
  return {
    blockingIssues: reports.reduce((total, report) => total + report.errorCount, 0),
    warnings: reports.reduce((total, report) => total + report.warningCount, 0),
    blockedProducts: reports.filter((report) => report.errorCount > 0).length,
    attentionProducts: reports.filter((report) => report.issues.length > 0).length,
    clearProducts: reports.filter((report) => report.issues.length === 0).length,
    readyProducts: reports.filter((report) => report.errorCount === 0 && report.product.status === "ready").length,
    syncedProducts: reports.filter((report) => report.readiness === "synced").length,
  };
}
