import type { ImportFieldChange, ProductCopy } from "./types";

const fields: Array<{ key: keyof ProductCopy; label: string }> = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "priceCents", label: "Price" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "shopSection", label: "Shop section" },
  { key: "etsyTaxonomy", label: "Etsy taxonomy" },
  { key: "isTaxable", label: "Tax status" },
  { key: "tags", label: "Tags" },
  { key: "quantity", label: "Quantity" },
  { key: "state", label: "Listing state" },
  { key: "images", label: "Images" },
  { key: "variants", label: "Variants" },
];

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function displayValue(key: keyof ProductCopy, value: ProductCopy[keyof ProductCopy] | undefined): string {
  if (value === undefined || value === null || value === "") return "Not set";
  if (key === "priceCents") return `$${(Number(value) / 100).toFixed(2)}`;
  if (key === "isTaxable") return value ? "Taxable" : "Non-taxable";
  if (key === "tags") return (value as string[]).join(", ") || "No tags";
  if (key === "images") {
    const images = value as string[];
    return `${images.length} photo${images.length === 1 ? "" : "s"}`;
  }
  if (key === "variants") {
    const variants = value as ProductCopy["variants"];
    if (!variants.length) return "No variants";
    const names = variants.slice(0, 8).map((variant) => `${variant.name} (${variant.sku || "no SKU"}, qty ${variant.quantity})`);
    return `${variants.length} variant${variants.length === 1 ? "" : "s"}: ${names.join(", ")}${variants.length > names.length ? ` +${variants.length - names.length} more` : ""}`;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function buildImportFieldChanges(before: ProductCopy | null, after: ProductCopy | null): ImportFieldChange[] {
  if (!before && !after) return [];
  if (!after) return [{ field: "state", label: "Availability", before: "Active in Etsy import", after: "No longer active on Etsy" }];
  return fields.flatMap(({ key, label }) => {
    const beforeValue = before?.[key];
    const afterValue = after[key];
    if (before && sameValue(beforeValue, afterValue)) return [];
    return [{ field: key, label, before: before ? displayValue(key, beforeValue) : "New listing", after: displayValue(key, afterValue) }];
  });
}
