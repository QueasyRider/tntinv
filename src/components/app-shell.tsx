"use client";

import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BulkEdit, type BulkOperation } from "./bulk-edit";
import { Dashboard } from "./dashboard";
import { History } from "./history";
import { ProductEditor } from "./product-editor";
import { Settings, type SettingsPayload } from "./settings";
import { Sidebar, type View } from "./sidebar";
import { Topbar } from "./topbar";
import type { AppState, Product, ProductCopy } from "@/lib/types";

interface ApiResult { ok: boolean; error?: string; errors?: string[]; state?: AppState; count?: number; missingImageCount?: number; success?: number; label?: string }

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

  async function call(url: string, label: string, init: RequestInit = {}) {
    setBusy(label);
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
      const result = await response.json() as ApiResult;
      if (result.state) setState(result.state);
      if (!response.ok || !result.ok) throw new Error(result.error || result.errors?.join(" ") || "Request failed.");
      return result;
    } finally { setBusy(null); }
  }

  const notifyError = (error: unknown) => setToast({ tone: "error", message: error instanceof Error ? error.message : "Something went wrong." });
  const openProduct = (product: Product) => { setActiveProductId(product.id); setView("inventory"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function runImport() {
    try {
      const result = await call("/api/import", "import", { method: "POST" });
      const imageNote = result.missingImageCount ? ` ${result.missingImageCount} listing${result.missingImageCount === 1 ? "" : "s"} still need an image.` : "";
      setToast({ tone: "success", message: `${result.count || 0} Etsy products refreshed into the local working copy.${imageNote}` });
    }
    catch (error) { notifyError(error); }
  }
  async function runExport(ids: string[]) {
    if (!ids.length) { setToast({ tone: "error", message: "Select at least one product first." }); return; }
    try { const result = await call("/api/export", "export", { method: "POST", body: JSON.stringify({ ids }) }); setSelected(new Set()); setToast({ tone: "success", message: `${result.success || ids.length} product${ids.length === 1 ? "" : "s"} exported to Square.` }); }
    catch (error) { notifyError(error); }
  }
  async function saveProduct(working: ProductCopy, markReady: boolean) {
    if (!activeProductId) return;
    try { await call(`/api/products/${activeProductId}`, "save", { method: "PATCH", body: JSON.stringify({ working, markReady }) }); setToast({ tone: "success", message: markReady ? "Product is validated and ready to export." : "Working copy saved. Etsy was not changed." }); }
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
    {activeProduct ? <ProductEditor product={activeProduct} activities={state.activities} onBack={() => setActiveProductId(null)} onSave={saveProduct} onExport={() => runExport([activeProduct.id])} busy={busy} />
      : view === "history" ? <History state={state} />
      : view === "settings" ? <Settings state={state} onSave={saveSettings} onTest={testConnection} busy={busy} />
      : view === "bulk" ? <BulkEdit products={state.products} initialSelected={selected} onApply={applyBulk} busy={busy === "bulk"} />
      : <Dashboard state={state} selected={selected} setSelected={setSelected} onOpen={openProduct} onImport={runImport} onExport={runExport} onBulk={() => setBulkModal(true)} busy={busy} inventoryOnly={view === "inventory"} />}
    <footer className="legal-footer">‘Etsy’ is a trademark of Etsy, Inc. This Application uses Etsy&apos;s API, but is not endorsed or certified by Etsy.</footer>
  </div>
  {bulkModal && <BulkEdit products={state.products} initialSelected={selected} onApply={applyBulk} onClose={() => setBulkModal(false)} modal busy={busy === "bulk"} />}
  {toast && <div className={`toast ${toast.tone}`} role="status">{toast.tone === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={17} /></button></div>}
  </div>;
}
