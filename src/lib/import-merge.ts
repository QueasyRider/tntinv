import type { ProductCopy, Variant } from "./types";

const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined).sort();
    const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function generatedSkuKind(sku: string, etsyListingId: string): "legacy" | "current" | null {
  const normalized = normalizeSku(sku);
  const listingId = normalizeSku(etsyListingId);
  const legacyPrefix = `ETSY-${listingId}`;
  if (normalized === legacyPrefix || normalized.startsWith(`${legacyPrefix}-`)) return "legacy";
  if (normalized === listingId || normalized.startsWith(`${listingId}-`)) return "current";
  return null;
}

function mergeValue<T>(previousOriginal: T, working: T, imported: T): T {
  return sameValue(imported, previousOriginal) ? working : imported;
}

function mergeSku(etsyListingId: string, previousOriginal: string, working: string, imported: string): string {
  if (!sameValue(imported, previousOriginal)) return imported;
  const importedSku = imported.trim();
  if (!importedSku) return working;
  const workingKind = generatedSkuKind(working, etsyListingId);
  if (workingKind === "legacy") return importedSku;
  if (workingKind === "current" && !generatedSkuKind(importedSku, etsyListingId)) return importedSku;
  return working;
}

function variantsMatch(left: Variant, right: Variant): boolean {
  if (left.etsyProductId && right.etsyProductId) return left.etsyProductId === right.etsyProductId;
  if (left.id === right.id) return true;
  const leftSku = normalizeSku(left.sku);
  return Boolean(leftSku && leftSku === normalizeSku(right.sku));
}

function findVariant(variants: Variant[], target: Variant): Variant | undefined {
  return variants.find((variant) => variantsMatch(variant, target));
}

function retainSquareVariationMapping(imported: Variant, working: Variant[]): Variant {
  const mappedVariant = findVariant(working, imported)
    || working.find((variant) => normalizeSku(variant.sku) === normalizeSku(imported.sku));
  return { ...imported, squareVariationId: mappedVariant?.squareVariationId };
}

function mergeVariant(etsyListingId: string, previousOriginal: Variant, working: Variant, imported: Variant): Variant {
  return {
    id: imported.id,
    etsyProductId: imported.etsyProductId,
    name: mergeValue(previousOriginal.name, working.name, imported.name),
    optionName: mergeValue(previousOriginal.optionName, working.optionName, imported.optionName),
    optionValue: mergeValue(previousOriginal.optionValue, working.optionValue, imported.optionValue),
    sku: mergeSku(etsyListingId, previousOriginal.sku, working.sku, imported.sku),
    priceCents: mergeValue(previousOriginal.priceCents, working.priceCents, imported.priceCents),
    quantity: mergeValue(previousOriginal.quantity, working.quantity, imported.quantity),
    squareVariationId: working.squareVariationId,
  };
}

function mergeVariants(etsyListingId: string, previousOriginal: Variant[], working: Variant[], imported: Variant[]): Variant[] {
  const merged = imported.map((importedVariant) => {
    const previousVariant = findVariant(previousOriginal, importedVariant);
    const workingVariant = findVariant(working, importedVariant);
    if (previousVariant && workingVariant) return mergeVariant(etsyListingId, previousVariant, workingVariant, importedVariant);
    return retainSquareVariationMapping(importedVariant, working);
  });

  const locallyAdded = working.filter((workingVariant) =>
    !findVariant(previousOriginal, workingVariant) && !findVariant(imported, workingVariant),
  );
  return [...merged, ...locallyAdded];
}

export function rebaseImportedProductCopy(imported: ProductCopy, working: ProductCopy): ProductCopy {
  return {
    ...imported,
    squareCategoryId: working.squareCategoryId,
    variants: imported.variants.map((variant) => retainSquareVariationMapping(variant, working.variants)),
  };
}

export function mergeImportedProductCopy(
  etsyListingId: string,
  previousOriginal: ProductCopy,
  working: ProductCopy,
  imported: ProductCopy,
): ProductCopy {
  return {
    title: mergeValue(previousOriginal.title, working.title, imported.title),
    description: mergeValue(previousOriginal.description, working.description, imported.description),
    priceCents: mergeValue(previousOriginal.priceCents, working.priceCents, imported.priceCents),
    sku: mergeSku(etsyListingId, previousOriginal.sku, working.sku, imported.sku),
    category: mergeValue(previousOriginal.category, working.category, imported.category),
    squareCategoryId: working.squareCategoryId,
    tags: mergeValue(previousOriginal.tags, working.tags, imported.tags),
    quantity: mergeValue(previousOriginal.quantity, working.quantity, imported.quantity),
    state: mergeValue(previousOriginal.state, working.state, imported.state),
    images: mergeValue(previousOriginal.images, working.images, imported.images),
    variants: mergeVariants(etsyListingId, previousOriginal.variants, working.variants, imported.variants),
  };
}

export function productCopiesMatch(left: ProductCopy, right: ProductCopy): boolean {
  return sameValue(left, right);
}
