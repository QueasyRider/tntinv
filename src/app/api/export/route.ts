import { requireApiSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { exportProductToSquare, listSquareCategories, listSquareTaxes } from "@/lib/square";
import { addActivity, finishSyncRun, getAppState, getProduct, getSettings, markExported, markExportError, startSyncRun } from "@/lib/repository";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as { ids?: string[] };
  if (!body.ids?.length) return apiError(new Error("Select at least one product to export."));
  const run = await startSyncRun("local_to_square", body.ids.length);
  const settings = await getSettings();
  const errors: string[] = [];
  let success = 0;
  let squareCatalogData: Promise<[
    Awaited<ReturnType<typeof listSquareCategories>>,
    Awaited<ReturnType<typeof listSquareTaxes>>,
  ]> | null = null;
  for (const [index, id] of body.ids.entries()) {
    const product = await getProduct(id);
    if (!product) { errors.push(`Product ${id} no longer exists.`); continue; }
    try {
      if (settings.mode === "demo") {
        const copy = structuredClone(product.working);
        if (!copy.variants.length) copy.variants = [{ id: "regular", name: "Regular", optionName: "Option", optionValue: "Regular", sku: copy.sku, priceCents: copy.priceCents, quantity: copy.quantity, squareVariationId: `DEMO-VAR-${product.etsyListingId}` }];
        else copy.variants = copy.variants.map((variant, variantIndex) => ({ ...variant, squareVariationId: variant.squareVariationId || `DEMO-VAR-${product.etsyListingId}-${variantIndex + 1}` }));
        await markExported(product.id, product.squareItemId || `DEMO-SQ-${product.etsyListingId}`, Date.now(), copy);
      } else {
        squareCatalogData ||= Promise.all([listSquareCategories(), listSquareTaxes()]);
        const [squareCategories, squareTaxes] = await squareCatalogData;
        await exportProductToSquare(product, `${run.id}-${index}`, squareCategories, squareTaxes);
      }
      success++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      if (settings.mode === "live") await markExportError(product.id, message);
      errors.push(`${product.working.title}: ${message}`);
    }
  }
  await finishSyncRun(run.id, success, errors);
  if (success) await addActivity("export", `Exported ${success} product${success === 1 ? "" : "s"} to Square`, errors.length ? `${errors.length} need attention.` : "Catalog objects and inventory counts completed.");
  if (errors.length) await addActivity("error", `${errors.length} Square export${errors.length === 1 ? "" : "s"} failed`, errors.join(" • "));
  const payload = { ok: errors.length === 0, success, errors, state: await getAppState() };
  return errors.length && !success ? Response.json(payload, { status: 422 }) : Response.json(payload);
}
