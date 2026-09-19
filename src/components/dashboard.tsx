"use client";

import { AlertTriangle, ArrowUpDown, ArrowUpRight, Box, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Download, Edit3, ExternalLink, Filter, PackageCheck, Search, SquareArrowOutUpRight, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { productImageDisplayUrl } from "@/lib/product-images";
import type { Activity, AppState, Product, ProductStatus } from "@/lib/types";

const statusLabel: Record<ProductStatus, string> = { ready: "Ready", needs_review: "Needs review", exported: "Exported", error: "Error" };
const PAGE_SIZE = 30;
const productCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
type SortKey = "product" | "sku";
type SortDirection = "ascending" | "descending";

function Status({ status }: { status: ProductStatus }) {
  const Icon = status === "ready" ? CheckCircle2 : status === "exported" ? Upload : status === "error" ? AlertTriangle : CircleAlert;
  return <span className={`status ${status}`}><Icon size={14} />{statusLabel[status]}</span>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Box; tone?: string }) {
  return <div className={`metric ${tone || ""}`}><div><span>{label}</span><strong>{value}</strong></div><Icon size={30} strokeWidth={1.5} /></div>;
}

function ActivityRow({ activity }: { activity: Activity }) {
  const Icon = activity.kind === "export" ? Upload : activity.kind === "import" ? Download : activity.kind === "error" ? AlertTriangle : Check;
  return <div className={`activity ${activity.kind}`}><span className="activity-icon"><Icon size={15} /></span><div><strong>{activity.title}</strong><small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(activity.createdAt))}</small></div></div>;
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={13} />;
  return direction === "ascending" ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
}

export function Dashboard({ state, selected, setSelected, onOpen, onImport, onExport, onBulk, onHistory, busy, inventoryOnly = false }: {
  state: AppState; selected: Set<string>; setSelected: (value: Set<string>) => void; onOpen: (product: Product) => void;
  onImport: () => void; onExport: (ids: string[]) => void; onBulk: () => void; onHistory: () => void; busy: string | null; inventoryOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ProductStatus>("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = state.products.filter((product) => {
      const searchable = [product.working.title, product.working.sku, product.etsyListingId, ...product.working.variants.map((variant) => variant.sku)];
      const matches = !query || searchable.some((value) => value.toLowerCase().includes(query));
      return matches && (filter === "all" || product.status === filter);
    });
    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const leftValue = sort.key === "product" ? left.working.title : left.working.sku;
      const rightValue = sort.key === "product" ? right.working.title : right.working.sku;
      const result = productCollator.compare(leftValue, rightValue);
      return sort.direction === "ascending" ? result : -result;
    });
  }, [state.products, search, filter, sort]);
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleProducts = products.slice(firstIndex, firstIndex + PAGE_SIZE);
  const firstVisible = products.length ? firstIndex + 1 : 0;
  const lastVisible = Math.min(firstIndex + PAGE_SIZE, products.length);
  const toggleSort = (key: SortKey) => {
    setSort((current) => current?.key === key ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" });
    setPage(1);
  };
  const toggle = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); };
  const allSelected = visibleProducts.length > 0 && visibleProducts.every((product) => selected.has(product.id));

  return <div className={`dashboard-grid ${inventoryOnly ? "inventory-wide" : ""}`}><main className="dashboard-main">
    <section className="page-head"><div><h1>{inventoryOnly ? "INVENTORY" : "INVENTORY TRANSFER"}</h1><p>Same good stuff. New homes.</p></div><div className="head-actions"><button className="button lime" onClick={onImport} disabled={Boolean(busy)}><Download size={18} />{busy === "import" ? "Importing…" : "Import from Etsy"}</button><button className="button dark" onClick={() => onExport([...selected])} disabled={!selected.size || Boolean(busy)}><Upload size={18} />{busy === "export" ? "Exporting…" : "Export selected"}</button></div></section>
    {!inventoryOnly && <section className="metrics" aria-label="Inventory metrics"><Metric label="Products" value={state.metrics.imported} icon={Box} /><Metric label="Ready" value={state.metrics.ready} icon={PackageCheck} tone="green" /><Metric label="Exported" value={state.metrics.exported} icon={SquareArrowOutUpRight} tone="blue" /><Metric label="Errors" value={state.metrics.errors} icon={AlertTriangle} tone="pink" /></section>}
    <section className="table-workspace">
      <div className="table-tools"><label className="search"><Search size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search title, SKU, listing ID" /></label><div className="filters" aria-label="Product status filter">{(["all", "ready", "needs_review", "exported", "error"] as const).map((id) => <button key={id} className={filter === id ? "active" : ""} onClick={() => { setFilter(id); setPage(1); }}>{id === "all" ? `All products (${state.metrics.imported})` : `${statusLabel[id]} (${state.products.filter((product) => product.status === id).length})`}</button>)}</div><button className="filter-icon" aria-label="More filters"><Filter size={17} /></button></div>
      {selected.size > 0 && <div className="selection-bar"><strong><span className="checked"><Check size={15} /></span>{selected.size} product{selected.size === 1 ? "" : "s"} selected</strong><button onClick={() => selected.size === 1 && onOpen(state.products.find((product) => selected.has(product.id))!)} disabled={selected.size !== 1}><Edit3 size={15} /> Edit</button><button onClick={onBulk}><ArrowUpRight size={15} /> Bulk tools</button><button onClick={() => onExport([...selected])}><Upload size={15} /> Export selected</button><button className="clear" onClick={() => setSelected(new Set())}>Clear selection <X size={16} /></button></div>}
      <div className="table-scroll"><table><thead><tr><th className="check-cell"><input aria-label="Select all products on this page" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set([...selected].filter((id) => !visibleProducts.some((product) => product.id === id))) : new Set([...selected, ...visibleProducts.map((product) => product.id)]))} /></th><th aria-sort={sort?.key === "product" ? sort.direction : "none"}><button className={`sort-header ${sort?.key === "product" ? "active" : ""}`} onClick={() => toggleSort("product")}>Product <SortIndicator active={sort?.key === "product"} direction={sort?.direction || "ascending"} /></button></th><th>Etsy listing</th><th aria-sort={sort?.key === "sku" ? sort.direction : "none"}><button className={`sort-header ${sort?.key === "sku" ? "active" : ""}`} onClick={() => toggleSort("sku")}>SKU <SortIndicator active={sort?.key === "sku"} direction={sort?.direction || "ascending"} /></button></th><th>Price</th><th>Qty</th><th>Variants</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.id} className={selected.has(product.id) ? "selected" : ""}>
        <td className="check-cell"><input aria-label={`Select ${product.working.title}`} type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} /></td>
        <td><button className="product-cell" onClick={() => onOpen(product)}><span className="thumb" aria-hidden="true" style={{ backgroundImage: `url(${productImageDisplayUrl(product.working.images[0] || product.original.images[0])})` }}></span><span><strong>{product.working.title}</strong><small>{product.working.category} · {product.working.state}</small></span></button></td>
        <td><a href={`https://www.etsy.com/listing/${product.etsyListingId}`} target="_blank" rel="noreferrer">#{product.etsyListingId}<ExternalLink size={12} /></a></td><td className="mono">{product.working.sku}</td><td>${(product.working.priceCents / 100).toFixed(2)}</td><td>{product.working.quantity}</td><td className="variant-count">{product.working.variants.length}</td><td><Status status={product.status} /></td><td><span className="date">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(product.updatedAt))}<small>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(product.updatedAt))}</small></span></td><td><button className="row-go" onClick={() => onOpen(product)} aria-label={`Edit ${product.working.title}`}><ChevronRight size={18} /></button></td>
      </tr>)}</tbody></table>{!products.length && <div className="empty"><Search size={28} /><strong>No products match</strong><span>Try a different search or filter.</span></div>}</div>
      <footer className="table-footer"><span>Showing {firstVisible}–{lastVisible} of {products.length} product{products.length === 1 ? "" : "s"}</span><div><button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Previous inventory page"><ChevronLeft size={15} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} className={pageNumber === currentPage ? "active" : ""} onClick={() => setPage(pageNumber)} aria-label={`Inventory page ${pageNumber}`} aria-current={pageNumber === currentPage ? "page" : undefined}>{pageNumber}</button>)}<button onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label="Next inventory page"><ChevronRight size={15} /></button></div></footer>
    </section>
  </main>{!inventoryOnly && <aside className="activity-rail"><h2>RECENT ACTIVITY</h2>{state.activities.slice(0, 8).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}<button className="history-link" onClick={onHistory}>View all history <ArrowUpRight size={15} /></button><div className="rail-stamp">THRIFT<br />HARDER ★</div></aside>}</div>;
}
