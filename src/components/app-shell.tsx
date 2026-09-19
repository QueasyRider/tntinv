"use client";

import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BulkEdit, type BulkOperation } from "./bulk-edit";
import { Dashboard } from "./dashboard";
import { History } from "./history";
import { PreflightCenter } from "./preflight-center";
import { ProductEditor } from "./product-editor";
import { Settings, type SettingsPayload } from "./settings";
import { Sidebar, type View } from "./sidebar";
import { Topbar } from "./topbar";
import { buildPreflightReports } from "@/lib/preflight";
import type { AppState, Product, ProductCopy } from "@/lib/types";

interface ApiResult { ok: boolean; error?: string; errors?: string[]; state?: AppState; count?: number; missingImageCount?: number; skuErrorCount?: number; hiddenInactiveCount?: number; duplicateSkuProductCount?: number; visibleProductCount?: number; success?: number; label?: string; total?: number; nextOffset?: number; done?: boolean; runId?: string }

async function readApiResult(response: Response): Promise<ApiResult> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as ApiResult;
  } catch {
    if ([502, 503, 504].includes(response.status)) {
      throw new Error("The import server was interrupted while processing this batch. Products from completed batches were saved; click Import from Etsy to safely retry.");
    }
    throw new Error(`The server returned an unexpected response (${response.status}). Please try again.`);
  }
}

export function AppShell({ initialState }: { initialState: AppState }) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const activeProduct = useMemo(() => state.products.find((product) => product.id === activeProductId) || null, [state.products, activeProductId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const connectionError = params.get("connectionError");
      if (connected) {
        setToast({ tone: "success", message: `${connected === "etsy" ? "Etsy" : "Square"} connected successfully.` });
        setView("settings");
        void fetch("/api/state", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((next: AppState | null) => next && setState(next));
      }
      if (connectionError) { setToast({ tone: "error", message: connectionError }); setView("settings"); }
      if (connected || connectionError) window.history.replaceState({}, "", "/");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function call(url: string, label: string, init: RequestInit = {}, manageBusy = true) {
    if (manageBusy) setBusy(label);
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
      const result = await readApiResult(response);
      if (result.state) setState(result.state);
      if (!response.ok || !result.ok) throw new Error(result.error || result.errors?.join(" ") || "Request failed.");
      return result;
    } finally { if (manageBusy) setBusy(null); }
  }

  const notifyError = (error: unknown) => setToast({ tone: "error", message: error instanceof Error ? error.message : "Something went wrong." });
  const openProduct = (product: Product) => { setActiveProductId(product.id); setView("inventory"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function runImport() {
    setBusy("import");
    let offset = 0;
    let runId: string | undefined;
    let importedCount = 0;
    let missingImageCount = 0;
    let skuErrorCount = 0;
    let hiddenInactiveCount = 0;
    let duplicateSkuProductCount = 0;
    let visibleProductCount = 0;
    try {
      while (true) {
        const result = await call("/api/import", "import", { method: "POST", body: JSON.stringify({ offset, runId }) }, false);
        importedCount += result.count || 0;
        missingImageCount += result.missingImageCount || 0;
        skuErrorCount += result.skuErrorCount || 0;
        hiddenInactiveCount += result.hiddenInactiveCount || 0;
        duplicateSkuProductCount = result.duplicateSkuProductCount || duplicateSkuProductCount;
        visibleProductCount = result.visibleProductCount || visibleProductCount;
        if (result.done) break;
        if (!result.runId || typeof result.nextOffset !== "number" || result.nextOffset <= offset) throw new Error("The Etsy import stopped before the next batch could begin. Please try again.");
        runId = result.runId;
        offset = result.nextOffset;
      }
      const imageNote = missingImageCount ? ` ${missingImageCount} listing${missingImageCount === 1 ? "" : "s"} still need an image.` : "";
      const skuNote = skuErrorCount ? ` ${skuErrorCount} listing${skuErrorCount === 1 ? " has" : "s have"} unavailable_sku and ${skuErrorCount === 1 ? "was" : "were"} flagged for cleanup.` : "";
      const inactiveNote = hiddenInactiveCount ? ` ${hiddenInactiveCount} non-active Etsy listing${hiddenInactiveCount === 1 ? " was" : "s were"} removed from view.` : "";
      const duplicateNote = duplicateSkuProductCount ? ` ${duplicateSkuProductCount} product${duplicateSkuProductCount === 1 ? "" : "s"} share SKUs and ${duplicateSkuProductCount === 1 ? "is" : "are"} marked Error for cleanup.` : "";
      setToast({ tone: "success", message: `${importedCount} active Etsy listings processed into ${visibleProductCount || importedCount} separate products.${duplicateNote}${inactiveNote}${skuNote}${imageNote}` });
    }
    catch (error) { notifyError(error); }
    finally { setBusy(null); }
  }
  async function runExport(ids: string[]) {
    if (!ids.length) { setToast({ tone: "error", message: "Select at least one product first." }); return; }
    const selectedIds = new Set(ids);
    const blocked = buildPreflightReports(state.products).filter((report) => selectedIds.has(report.product.id) && report.errorCount > 0);
    if (blocked.length) {
      setSelected(new Set(blocked.map((report) => report.product.id)));
      setView("preflight");
      setToast({ tone: "error", message: `${blocked.length} selected product${blocked.length === 1 ? " has" : "s have"} blocking issues. Fix ${blocked.length === 1 ? "it" : "them"} before exporting.` });
      return;
    }
    try { const result = await call("/api/export", "export", { method: "POST", body: JSON.stringify({ ids }) }); setSelected(new Set()); setToast({ tone: "success", message: `${result.success || ids.length} product${ids.length === 1 ? "" : "s"} exported to Square.` }); }
    catch (error) { notifyError(error); }
  }
  async function saveProduct(working: ProductCopy, markReady: boolean) {
    if (!activeProductId) return;
    try { await call(`/api/products/${activeProductId}`, "save", { method: "PATCH", body: JSON.stringify({ working, markReady }) }); setToast({ tone: "success", message: markReady ? "Product is validated and ready to export." : "Working copy saved. Etsy was not changed." }); }
    catch (error) { notifyError(error); }
  }
  async function deleteActiveProduct() {
    if (!activeProduct) return;
    const confirmed = window.confirm(`Delete "${activeProduct.working.title}" from this inventory app?\n\nThis will not delete it from Etsy or Square. If the listing is still active on Etsy, the next Etsy import will add it again.`);
    if (!confirmed) return;
    try {
      await call(`/api/products/${activeProduct.id}`, "delete", { method: "DELETE" });
      setSelected((current) => {
        const next = new Set(current);
        next.delete(activeProduct.id);
        return next;
      });
      setActiveProductId(null);
      setToast({ tone: "success", message: "Listing removed from this inventory app. Etsy and Square were not changed." });
    }
    catch (error) { notifyError(error); }
  }
  async function applyBulk(ids: string[], operation: BulkOperation) {
    try {
      const result = await call("/api/products/bulk", "bulk", { method: "POST", body: JSON.stringify({ ids, operation }) });
      const count = result.count || ids.length;
      setBulkModal(false); setSelected(new Set(ids));
      setToast({ tone: "success", message: `Updated ${count} local working ${count === 1 ? "copy" : "copies"}.` });
    }
    catch (error) { notifyError(error); }
  }
  async function saveSettings(payload: SettingsPayload) {
    try { await call("/api/settings", "settings", { method: "POST", body: JSON.stringify(payload) }); setToast({ tone: "success", message: "API settings saved securely on the server." }); }
    catch (error) { notifyError(error); }
  }
  async function testConnection(provider: "etsy" | "square") {
    try { const result = await call(`/api/connections/${provider}/test`, `test-${provider}`, { method: "POST" }); setToast({ tone: "success", message: result.label || `${provider} connection passed.` }); }
    catch (error) { notifyError(error); }
  }

  function changeView(next: View) {
    setView(next); setActiveProductId(null); if (next !== "bulk") setBulkModal(false); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className="app-shell"><Sidebar view={view} onChange={changeView} /><div className="app-column"><Topbar connections={state.connections} />
    {activeProduct ? <ProductEditor product={activeProduct} activities={state.activities} backLabel={view === "preflight" ? "Fix center" : "Inventory"} onBack={() => setActiveProductId(null)} onSave={saveProduct} onDelete={deleteActiveProduct} onExport={() => runExport([activeProduct.id])} busy={busy} />
      : view === "history" ? <History state={state} />
      : view === "settings" ? <Settings state={state} onSave={saveSettings} onTest={testConnection} busy={busy} />
      : view === "preflight" ? <PreflightCenter state={state} onOpen={openProduct} onExport={runExport} busy={busy} />
      : view === "bulk" ? <BulkEdit products={state.products} initialSelected={selected} onApply={applyBulk} busy={busy === "bulk"} />
      : <Dashboard state={state} selected={selected} setSelected={setSelected} onOpen={openProduct} onImport={runImport} onExport={runExport} onBulk={() => setBulkModal(true)} onHistory={() => changeView("history")} onPreflight={() => changeView("preflight")} busy={busy} inventoryOnly={view === "inventory"} />}
    <footer className="legal-footer">‘Etsy’ is a trademark of Etsy, Inc. This Application uses Etsy&apos;s API, but is not endorsed or certified by Etsy.</footer>
  </div>
  {bulkModal && <BulkEdit products={state.products} initialSelected={selected} onApply={applyBulk} onClose={() => setBulkModal(false)} modal busy={busy === "bulk"} />}
  {toast && <div className={`toast ${toast.tone}`} role="status">{toast.tone === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={17} /></button></div>}
  </div>;
}
