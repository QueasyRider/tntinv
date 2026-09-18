import { importFromEtsy } from "@/lib/etsy";
import { apiError } from "@/lib/http";
import { addActivity, clearDemoProducts, failSyncRun, finishSyncRun, getAppState, getSettings, seedDemoProducts, startSyncRun, updateSyncRunProgress } from "@/lib/repository";

export const maxDuration = 300;

const IMPORT_BATCH_SIZE = 12;

interface ImportRequest {
  offset?: number;
  runId?: string;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const body = await request.json().catch(() => ({})) as ImportRequest;
  const offset = nonNegativeInteger(body.offset);
  let runId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : undefined;
  console.log(JSON.stringify({ level: "info", message: "Etsy import batch started", route: "/api/import", requestId, offset, runId }));
  try {
    const settings = await getSettings();
    if (settings.mode === "demo") {
      const run = await startSyncRun("etsy_to_local", 0);
      runId = run.id;
      const count = await seedDemoProducts();
      await finishSyncRun(run.id, count, []);
      return Response.json({ ok: true, count, missingImageCount: 0, skuErrorCount: 0, total: count, nextOffset: count, done: true, runId, state: await getAppState() });
    }

    if (offset === 0) {
      const run = await startSyncRun("etsy_to_local", 0);
      runId = run.id;
      await clearDemoProducts();
    } else if (!runId) {
      throw new Error("The Etsy import session could not be resumed. Start the import again.");
    }

    const result = await importFromEtsy({ offset, limit: IMPORT_BATCH_SIZE });
    const importedCount = await updateSyncRunProgress(runId, result.total, result.count);
    if (!result.done) {
      console.log(JSON.stringify({ level: "info", message: "Etsy import batch completed", route: "/api/import", requestId, offset, count: result.count, total: result.total, nextOffset: result.nextOffset, durationMs: Date.now() - startedAt }));
      return Response.json({ ok: true, ...result, importedCount, runId });
    }

    await finishSyncRun(runId, importedCount, []);
    await addActivity("import", `Processed ${importedCount} Etsy listings`, "All Etsy fields compared and refreshed into working copies; Square mappings retained. Listings with unavailable_sku were imported separately and flagged for cleanup.");
    console.log(JSON.stringify({ level: "info", message: "Etsy import completed", route: "/api/import", requestId, count: importedCount, durationMs: Date.now() - startedAt }));
    return Response.json({ ok: true, ...result, importedCount, runId, state: await getAppState() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    if (runId) await failSyncRun(runId, message).catch(() => undefined);
    await addActivity("error", "Etsy import failed", message).catch(() => undefined);
    console.error(JSON.stringify({ level: "error", message: "Etsy import failed", route: "/api/import", requestId, offset, runId, error: message, durationMs: Date.now() - startedAt }));
    return apiError(error);
  }
}
