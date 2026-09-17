import { importFromEtsy } from "@/lib/etsy";
import { apiError } from "@/lib/http";
import { addActivity, clearDemoProducts, finishSyncRun, getAppState, getSettings, seedDemoProducts, startSyncRun } from "@/lib/repository";

export async function POST() {
  const run = await startSyncRun("etsy_to_local", 0);
  try {
    const settings = await getSettings();
    if (settings.mode === "live") await clearDemoProducts();
    const count = settings.mode === "demo" ? await seedDemoProducts() : await importFromEtsy();
    await finishSyncRun(run.id, count, []);
    if (settings.mode === "live") await addActivity("import", `Imported ${count} products from Etsy`, "Original listings stored read-only; working copies refreshed.");
    return Response.json({ ok: true, count, state: await getAppState() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    await finishSyncRun(run.id, 0, [message]);
    await addActivity("error", "Etsy import failed", message);
    return apiError(error);
  }
}
