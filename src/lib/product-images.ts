export const STORED_PRODUCT_IMAGE_PREFIX = "app-image:";

export function storedProductImageSource(id: string): string {
  return `${STORED_PRODUCT_IMAGE_PREFIX}${id}`;
}

export function storedProductImageId(source: string): string | null {
  return source.startsWith(STORED_PRODUCT_IMAGE_PREFIX)
    ? source.slice(STORED_PRODUCT_IMAGE_PREFIX.length)
    : null;
}

export function productImageDisplayUrl(source?: string): string {
  if (!source) return "";
  const id = storedProductImageId(source);
  return id ? `/api/product-images/${encodeURIComponent(id)}` : source;
}
