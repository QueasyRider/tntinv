export const UNAVAILABLE_SKU_KEY = "UNAVAILABLE_SKU";
export const UNAVAILABLE_SKU_ERROR = "Replace unavailable_sku with a real, unique SKU before exporting to Square.";

export const normalizeSkuKey = (sku: string): string => sku.trim().toUpperCase();

export function isUnavailableSku(sku: string): boolean {
  return normalizeSkuKey(sku) === UNAVAILABLE_SKU_KEY;
}

export function hasUnavailableSku(copy: { sku: string; variants: Array<{ sku: string }> }): boolean {
  return isUnavailableSku(copy.sku) || copy.variants.some((variant) => isUnavailableSku(variant.sku));
}
