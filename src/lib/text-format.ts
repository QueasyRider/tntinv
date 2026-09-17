import type { ProductCopy } from "./types";

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  cent: "¢",
  colon: ":",
  copy: "©",
  euro: "€",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  pound: "£",
  quot: "\"",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  trade: "™",
  yen: "¥",
};

function validCodePoint(value: number): boolean {
  return Number.isInteger(value)
    && value > 0
    && value <= 0x10ffff
    && !(value >= 0xd800 && value <= 0xdfff);
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi, (entity, decimal, hexadecimal, named: string | undefined) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
      return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return namedEntities[named?.toLowerCase() || ""] ?? entity;
  });
}

export function normalizeProductText(copy: ProductCopy): ProductCopy {
  const decodeOptional = (value: string | undefined) => value === undefined ? undefined : decodeHtmlEntities(value);
  return {
    ...copy,
    title: decodeHtmlEntities(copy.title),
    description: decodeHtmlEntities(copy.description).replace(/\r\n?/g, "\n"),
    category: decodeHtmlEntities(copy.category),
    shopSection: decodeOptional(copy.shopSection),
    etsyTaxonomy: decodeOptional(copy.etsyTaxonomy),
    tags: copy.tags.map(decodeHtmlEntities),
    variants: copy.variants.map((variant) => ({
      ...variant,
      name: decodeHtmlEntities(variant.name),
      optionName: decodeHtmlEntities(variant.optionName),
      optionValue: decodeHtmlEntities(variant.optionValue),
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToSquareHtml(value: string): string {
  const normalized = decodeHtmlEntities(value).replace(/\r\n?/g, "\n");
  return `<p>${escapeHtml(normalized).replace(/\n/g, "<br>")}</p>`;
}
