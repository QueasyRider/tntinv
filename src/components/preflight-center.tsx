"use client";

import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, ImageOff, Search, ShieldAlert, ShieldCheck, Upload, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { buildPreflightReports, summarizePreflight, type PreflightReadiness } from "@/lib/preflight";
import { productImageDisplayUrl } from "@/lib/product-images";
import type { AppState, Product } from "@/lib/types";

type Filter = "attention" | "blocked" | "warnings" | "ready" | "synced" | "all";
const PAGE_SIZE = 25;
const readinessOrder: Record<PreflightReadiness, number> = { blocked: 0, warning: 1, ready: 2, synced: 3 };

function ReadinessBadge({ readiness }: { readiness: PreflightReadiness }) {
  const Icon = readiness === "blocked" ? ShieldAlert : readiness === "warning" ? CircleAlert : readiness === "synced" ? CheckCircle2 : ShieldCheck;
  const label = readiness === "blocked" ? "Blocked" : readiness === "warning" ? "Review" : readiness === "synced" ? "Synced" : "Clear";
  return <span className={`preflight-readiness ${readiness}`}><Icon size={14} />{label}</span>;
}

export function PreflightCenter({ state, onOpen, onExport, busy }: {
  state: AppState;
  onOpen: (product: Product) => void;
  onExport: (ids: string[]) => void;
  busy: string | null;
}) {
  const reports = useMemo(() => buildPreflightReports(state.products), [state.products]);
  const summary = useMemo(() => summarizePreflight(reports), [reports]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const readyIds = reports.filter((report) => report.errorCount === 0 && report.product.status === "ready").map((report) => report.product.id);
  const warningProducts = reports.filter((report) => report.warningCount > 0).length;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports
      .filter((report) => {
        const filterMatch = filter === "all"
          || (filter === "attention" && report.issues.length > 0)
          || (filter === "blocked" && report.errorCount > 0)
          || (filter === "warnings" && report.warningCount > 0)
          || (filter === "ready" && report.errorCount === 0 && report.product.status === "ready")
          || (filter === "synced" && report.product.status === "exported" && report.errorCount === 0);
        if (!filterMatch) return false;
        if (!query) return true;
        const searchable = [report.product.working.title, report.product.working.sku, report.product.etsyListingId, ...report.issues.flatMap((issue) => [issue.label, issue.message])];
        return searchable.some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => readinessOrder[left.readiness] - readinessOrder[right.readiness] || left.product.working.title.localeCompare(right.product.working.title));
  }, [filter, reports, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(firstIndex, firstIndex + PAGE_SIZE);
  const squareReady = state.settings.mode === "demo" || state.connections.square.status === "connected";

  const chooseFilter = (next: Filter) => { setFilter(next); setPage(1); };

  return <main className="section-page preflight-page">
    <header className="section-heading preflight-heading"><div><h1>PREFLIGHT &amp; FIX CENTER</h1><p>Catch catalog problems before they reach Square.</p></div><button className="button dark" disabled={!readyIds.length || Boolean(busy) || !squareReady} onClick={() => onExport(readyIds)}><Upload size={17} />{busy === "export" ? "Exporting…" : `Export ${readyIds.length} ready`}</button></header>

    {!squareReady && <div className="preflight-global-alert" role="alert"><AlertTriangle size={20} /><div><strong>Square is not connected</strong><span>Connect and test Square in API Settings before exporting. Product checks are still available below.</span></div></div>}

    <section className="preflight-summary" aria-label="Preflight summary">
      <button className={filter === "blocked" ? "active blocked" : "blocked"} onClick={() => chooseFilter("blocked")}><ShieldAlert size={24} /><span><strong>{summary.blockingIssues}</strong><small>Blocking issues</small><em>{summary.blockedProducts} products</em></span></button>
      <button className={filter === "warnings" ? "active warnings" : "warnings"} onClick={() => chooseFilter("warnings")}><AlertTriangle size={24} /><span><strong>{summary.warnings}</strong><small>Warnings</small><em>{warningProducts} products</em></span></button>
      <button className={filter === "ready" ? "active ready" : "ready"} onClick={() => chooseFilter("ready")}><ShieldCheck size={24} /><span><strong>{summary.readyProducts}</strong><small>Ready to export</small><em>No blocking issues</em></span></button>
      <button className={filter === "synced" ? "active synced" : "synced"} onClick={() => chooseFilter("synced")}><CheckCircle2 size={24} /><span><strong>{summary.syncedProducts}</strong><small>Already in Square</small><em>Stored mappings</em></span></button>
    </section>

    <section className="preflight-workspace">
      <div className="preflight-tools"><label className="search"><Search size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search products, SKUs, listings, or issues" /></label><div className="filters" aria-label="Preflight filter">
        {([
          ["attention", `Needs attention (${summary.attentionProducts})`],
          ["blocked", `Blocked (${summary.blockedProducts})`],
          ["warnings", `Warnings (${warningProducts})`],
          ["ready", `Ready (${summary.readyProducts})`],
          ["all", `All (${reports.length})`],
        ] as Array<[Filter, string]>).map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => chooseFilter(id)}>{label}</button>)}
      </div></div>

      <div className="preflight-list">
        {visible.map((report) => {
          const { product } = report;
          const canExport = report.errorCount === 0 && product.status === "ready";
          return <article className={`preflight-product ${report.readiness}`} key={product.id}>
            <div className="preflight-product-main"><span className="thumb" aria-hidden="true" style={{ backgroundImage: `url(${productImageDisplayUrl(product.working.images[0] || product.original.images[0])})` }}>{!product.working.images.length && !product.original.images.length ? <ImageOff size={17} /> : null}</span><div><button className="preflight-product-title" onClick={() => onOpen(product)}>{product.working.title || "Untitled product"}</button><span className="preflight-product-meta"><code>{product.working.sku || "No SKU"}</code><a href={`https://www.etsy.com/listing/${product.etsyListingId}`} target="_blank" rel="noreferrer">Etsy #{product.etsyListingId}<ExternalLink size={11} /></a><small>{product.working.variants.length} variant{product.working.variants.length === 1 ? "" : "s"}</small></span></div></div>
            <div className="preflight-status"><ReadinessBadge readiness={report.readiness} /><small>{report.errorCount ? `${report.errorCount} blocking` : report.warningCount ? `${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}` : "No issues found"}</small></div>
            <div className="preflight-issues">{report.issues.length ? report.issues.map((issue) => <div className={`preflight-issue ${issue.severity}`} key={`${product.id}-${issue.id}`}><span>{issue.severity === "error" ? <AlertTriangle size={14} /> : <CircleAlert size={14} />}</span><div><strong>{issue.label}</strong><p>{issue.message}</p></div></div>) : <div className="preflight-clear"><Check size={15} /><span>All local checks passed.</span></div>}</div>
            <div className="preflight-actions"><button className="button outline small" onClick={() => onOpen(product)}><Wrench size={15} />{report.issues.length ? "Fix product" : "View product"}</button>{canExport && <button className="button lime small" disabled={Boolean(busy) || !squareReady} onClick={() => onExport([product.id])}><Upload size={15} />Export</button>}</div>
          </article>;
        })}
        {!visible.length && <div className="empty"><ShieldCheck size={30} /><strong>No products in this view</strong><span>{filter === "attention" ? "Nothing needs attention. Your catalog is looking clean." : "Try another filter or search."}</span></div>}
      </div>

      <footer className="table-footer"><span>Showing {filtered.length ? firstIndex + 1 : 0}–{Math.min(firstIndex + PAGE_SIZE, filtered.length)} of {filtered.length} products</span><div><button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Previous preflight page"><ChevronLeft size={15} /></button><span className="preflight-page-count">Page {currentPage} of {pageCount}</span><button onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label="Next preflight page"><ChevronRight size={15} /></button></div></footer>
    </section>
  </main>;
}
