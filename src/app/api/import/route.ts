import { importFromEtsy } from "@/lib/etsy";
import { apiError } from "@/lib/http";
import { addActivity, clearDemoProducts, finishSyncRun, getAppState, getSettings, seedDemoProducts, startSyncRun } from "@/lib/repository";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  console.log(JSON.stringify({ level: "info", message: "Etsy import started", route: "/api/import", requestId }));
  const run = await startSyncRun("etsy_to_local", 0);
  try {
    const settings = await getSettings();
    if (settings.mode === "live") await clearDemoProducts();
    const result = settings.mode === "demo" ? { count: await seedDemoProducts(), missingImageCount: 0 } : await importFromEtsy();
    const { count, missingImageCount } = result;
    await finishSyncRun(run.id, count, []);
    if (settings.mode === "live") await addActivity("import", `Imported ${count} products from Etsy`, missingImageCount ? `${missingImageCount} listing${missingImageCount === 1 ? "" : "s"} returned without a usable image.` : "All Etsy fields compared and refreshed into working copies; Square mappings retained.");
    console.log(JSON.stringify({ level: "info", message: "Etsy import completed", route: "/api/import", requestId, count, missingImageCount, durationMs: Date.now() - startedAt }));
    return Response.json({ ok: true, count, missingImageCount, state: await getAppState() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    await finishSyncRun(run.id, 0, [message]);
    await addActivity("error", "Etsy import failed", message);
    console.error(JSON.stringify({ level: "error", message: "Etsy import failed", route: "/api/import", requestId, error: message, durationMs: Date.now() - startedAt }));
    return apiError(error);
  }
}
