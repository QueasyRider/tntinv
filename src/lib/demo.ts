import type { ProductCopy } from "./types";

export interface DemoSeed {
  etsyListingId: string;
  original: ProductCopy;
  working?: Partial<ProductCopy>;
  status: "ready" | "needs_review" | "exported" | "error";
  squareItemId?: string;
  lastError?: string;
}

const demoImages: Record<string, string> = {
  "photo-1529139574466-a303027c1d8b": "/products/midnight-rodeo-tee.webp",
  "photo-1564257577054-08d792e7ebce": "/products/deadstock-bloom-blouse.webp",
  "photo-1542272604-787c3835535d": "/products/electric-west-jacket.webp",
  "photo-1543163521-1bf539c55dd2": "/products/cherry-bomb-boots.webp",
  "photo-1576566588028-4147f3842f27": "/products/desert-dreamer-tee.webp",
  "photo-1559563458-527698bf5295": "/products/tooled-leather-bag.webp",
  "photo-1603252110481-7ba873bf42ab": "/products/indigo-bandana.webp",
  "photo-1511499767150-a48a237f0083": "/products/road-trip-shades.webp",
};
const image = (id: string) => demoImages[id];

export const DEMO_PRODUCTS: DemoSeed[] = [
  {
    etsyListingId: "9321176601",
    status: "ready",
    original: {
      title: "Midnight Rodeo Tee",
      description: "Vintage-inspired black rodeo graphic tee. Soft cotton with an easy unisex fit.",
      priceCents: 2800,
      sku: "TT-001",
      category: "Tops & Tees",
      tags: ["vintage", "rodeo", "western", "graphic tee"],
      quantity: 10,
      state: "active",
      images: [image("photo-1529139574466-a303027c1d8b")],
      variants: [
        { id: "v-001-s", etsyProductId: "5001", name: "Black / S", optionName: "Size", optionValue: "S", sku: "TT-001-S", priceCents: 2800, quantity: 4 },
        { id: "v-001-m", etsyProductId: "5002", name: "Black / M", optionName: "Size", optionValue: "M", sku: "TT-001-M", priceCents: 2800, quantity: 3 },
        { id: "v-001-l", etsyProductId: "5003", name: "Black / L", optionName: "Size", optionValue: "L", sku: "TT-001-L", priceCents: 2800, quantity: 3 },
      ],
    },
    working: {
      title: "Midnight Rodeo Tee — Vintage Graphic T-Shirt",
      description: "A vintage-inspired tee for late nights and wild hearts. Super-soft cotton with a relaxed fit. Perfect for concerts, road trips, and everyday rebels.",
      category: "T-Shirts",
      tags: ["vintage", "rodeo", "western", "graphic tee", "unisex"],
    },
  },
  {
    etsyListingId: "9321176602",
    status: "needs_review",
    original: {
      title: "Deadstock Bloom Blouse",
      description: "Deadstock 1970s floral blouse with balloon sleeves and a softly gathered collar.",
      priceCents: 4800,
      sku: "TT-002",
      category: "Blouses",
      tags: ["deadstock", "floral", "70s"],
      quantity: 2,
      state: "active",
      images: [image("photo-1564257577054-08d792e7ebce")],
      variants: [
        { id: "v-002-m", name: "Medium", optionName: "Size", optionValue: "M", sku: "TT-002-M", priceCents: 4800, quantity: 1 },
        { id: "v-002-l", name: "Large", optionName: "Size", optionValue: "L", sku: "TT-002-L", priceCents: 4800, quantity: 1 },
      ],
    },
  },
  {
    etsyListingId: "9321176603",
    status: "exported",
    squareItemId: "SQ-ITEM-ELECTRIC-WEST",
    original: { title: "Electric West Jacket", description: "Structured 1980s denim jacket with authentic fading and bright brass hardware.", priceCents: 8500, sku: "TT-003", category: "Jackets", tags: ["denim", "80s", "usa"], quantity: 1, state: "active", images: [image("photo-1542272604-787c3835535d")], variants: [] },
  },
  {
    etsyListingId: "9321176604",
    status: "error",
    lastError: "Square rejected duplicate SKU TT-004-8. Update the SKU and retry.",
    original: {
      title: "Cherry Bomb Boots", description: "Red leather western boots with a stacked heel and stitched flame detail.", priceCents: 12000, sku: "TT-004", category: "Boots", tags: ["western", "red", "leather"], quantity: 3, state: "active", images: [image("photo-1543163521-1bf539c55dd2")],
      variants: [
        { id: "v-004-7", name: "Size 7", optionName: "Size", optionValue: "7", sku: "TT-004-7", priceCents: 12000, quantity: 1 },
        { id: "v-004-8", name: "Size 8", optionName: "Size", optionValue: "8", sku: "TT-004-8", priceCents: 12000, quantity: 1 },
        { id: "v-004-9", name: "Size 9", optionName: "Size", optionValue: "9", sku: "TT-004-9", priceCents: 12000, quantity: 1 },
      ],
    },
  },
  {
    etsyListingId: "9321176605", status: "ready",
    original: { title: "Desert Dreamer Tee", description: "Single-stitch cream tee with a sun-faded desert graphic.", priceCents: 3200, sku: "TT-005", category: "Tops & Tees", tags: ["single stitch", "90s", "desert"], quantity: 3, state: "active", images: [image("photo-1576566588028-4147f3842f27")], variants: [
      { id: "v-005-l", name: "Large", optionName: "Size", optionValue: "L", sku: "TT-005-L", priceCents: 3200, quantity: 2 },
      { id: "v-005-xl", name: "XL", optionName: "Size", optionValue: "XL", sku: "TT-005-XL", priceCents: 3200, quantity: 1 },
    ] },
  },
  {
    etsyListingId: "9321176606", status: "needs_review",
    original: { title: "Tooled Leather Bag", description: "Warm brown tooled leather shoulder bag with a floral western pattern.", priceCents: 6800, sku: "TT-006", category: "Bags", tags: ["leather", "western", "tooled"], quantity: 1, state: "active", images: [image("photo-1559563458-527698bf5295")], variants: [] },
  },
  {
    etsyListingId: "9321176607", status: "exported", squareItemId: "SQ-ITEM-INDIGO-BANDANA",
    original: { title: "Indigo Bandana", description: "Classic cotton paisley bandana in deep indigo blue.", priceCents: 1800, sku: "TT-007", category: "Accessories", tags: ["cotton", "bandana", "blue"], quantity: 5, state: "active", images: [image("photo-1603252110481-7ba873bf42ab")], variants: [] },
  },
  {
    etsyListingId: "9321176608", status: "ready",
    original: { title: "Road Trip Shades", description: "Gold-tone vintage aviators with smoke lenses and a slim wire frame.", priceCents: 4200, sku: "TT-008", category: "Accessories", tags: ["aviator", "sunglasses", "gold"], quantity: 2, state: "active", images: [image("photo-1511499767150-a48a237f0083")], variants: [] },
  },
];
