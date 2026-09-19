"use client";

import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, ExternalLink, FilePlus2, History, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { productImageDisplayUrl } from "@/lib/product-images";
import type { AppState, ImportChangeReview, ImportChangeType, ImportReviewData, Product } from "@/lib/types";

type Filter = "attention" | ImportChangeType | "all";

const changeLabels: Record<ImportChangeType, string> = {
  new: "New",
  changed: "Changed",
  unchanged: "Unchanged",
  removed: "Removed",
};

const changeIcons = { new: FilePlus2, changed: RefreshCw, unchanged: CheckCircle2, removed: Trash2 };

interface ReviewApiResult { ok?: boolean; error?: string; count?: number; data?: ImportReviewData }

async function readReviewResponse(response: Response): Promise<ReviewApiResult> {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) as ReviewApiResult : {}; }
  catch { throw new Error(`The review server returned an unexpected response (${response.status}).`); }
}

export function ImportChangeReview({ state, onOpen }: { state: AppState; onOpen: (product: Product) => void }) {
  const [data, setData] = useState<ImportReviewData | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (runId?: string) => {
    setBusy("load");
    setError(null);
    try {
      const response = await fetch(`/api/import-reviews${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, { cache: "no-store" });
      const result = await readReviewResponse(response);
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "Import review could not be loaded.");
      setData(result.data);
      setExpanded(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Import review could not be loaded.");
    } finally { setBusy(null); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedRun = data?.runs.find((run) => run.id === data.selectedRunId) || null;
  const productsById = useMemo(() => new Map(state.products.map((product) => [product.id, product])), [state.products]);
  const counts = useMemo(() => {
    const reviews = data?.reviews || [];
    return {
      attention: reviews.filter((review) => review.changeType !== "unchanged" && !review.reviewed).length,
      new: reviews.filter((review) => review.changeType === "new").length,
      changed: reviews.filter((review) => review.changeType === "changed").length,
      removed: reviews.filter((review) => review.changeType === "removed").length,
      unchanged: reviews.filter((review) => review.changeType === "unchanged").length,
      all: reviews.length,
    };
  }, [data]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.reviews || []).filter((review) => {
      const matchesFilter = filter === "all"
        || (filter === "attention" ? review.changeType !== "unchanged" && !review.reviewed : review.changeType === filter);
      if (!matchesFilter) return false;
      if (!query) return true;
      return [review.title, review.sku, review.etsyListingId, ...review.changes.flatMap((change) => [change.label, change.before, change.after])]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [data, filter, search]);

  async function markReviewed(reviewId?: string) {
    if (!data?.selectedRunId) return;
    setBusy(reviewId || "all");
    setError(null);
    try {
      const response = await fetch("/api/import-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.selectedRunId, reviewId }),
      });
      const result = await readReviewResponse(response);
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "The review could not be updated.");
      setData(result.data);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The review could not be updated.");
    } finally { setBusy(null); }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <main className="section-page import-review-page">
    <header className="section-heading"><div><h1>IMPORT CHANGE REVIEW</h1><p>See exactly what changed each time Etsy inventory is refreshed.</p></div><div className="review-heading-actions"><button className="button outline" onClick={() => void load(data?.selectedRunId || undefined)} disabled={Boolean(busy)}><RefreshCw size={16} />Refresh</button><button className="button dark" onClick={() => void markReviewed()} disabled={!selectedRun?.unreviewedCount || Boolean(busy)}><Check size={17} />Mark all reviewed</button></div></header>

    <div className="review-safety-note"><History size={19} /><div><strong>Your working copies are already refreshed safely.</strong><span>This page is an audit inbox. Marking an item reviewed does not change Etsy, Square, or your product data.</span></div></div>
    {error && <div className="preflight-global-alert" role="alert"><AlertTriangle size={19} /><div><strong>Import review needs attention</strong><span>{error}</span></div></div>}

    <section className="review-run-bar"><label><span>Import run</span><select value={data?.selectedRunId || ""} onChange={(event) => void load(event.target.value)} disabled={Boolean(busy)}>{data?.runs.map((run, index) => <option value={run.id} key={run.id}>{index === 0 ? "Latest · " : ""}{new Date(run.startedAt).toLocaleString()} · {run.status}</option>)}</select></label>{selectedRun && <div className="review-run-meta"><span className={`run-status ${selectedRun.status}`}><Clock3 size={14} />{selectedRun.status}</span><span>{selectedRun.successCount} listings processed</span><span>{selectedRun.unreviewedCount} awaiting review</span></div>}</section>

    <section className="review-summary" aria-label="Import change summary">
      {(["new", "changed", "removed", "unchanged"] as ImportChangeType[]).map((type) => { const Icon = changeIcons[type]; return <button key={type} className={`${type} ${filter === type ? "active" : ""}`} onClick={() => setFilter(type)}><Icon size={22} /><span><strong>{counts[type]}</strong><small>{changeLabels[type]}</small></span></button>; })}
    </section>

    <section className="review-workspace">
      <div className="review-tools"><label className="search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, listing, or changed field" /></label><div className="filters" aria-label="Import change filters">{([
        ["attention", `Needs review (${counts.attention})`],
        ["new", `New (${counts.new})`],
        ["changed", `Changed (${counts.changed})`],
        ["removed", `Removed (${counts.removed})`],
        ["unchanged", `Unchanged (${counts.unchanged})`],
        ["all", `All (${counts.all})`],
      ] as Array<[Filter, string]>).map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>

      {busy === "load" && !data ? <div className="empty"><RefreshCw className="spin" size={28} /><strong>Loading import review…</strong></div> : <div className="review-list">{visible.map((review) => {
        const Icon = changeIcons[review.changeType];
        const isExpanded = expanded.has(review.id);
        const product = review.productId ? productsById.get(review.productId) : undefined;
        return <article className={`review-item ${review.changeType} ${review.reviewed ? "reviewed" : ""}`} key={review.id}>
          <button className="review-item-toggle" onClick={() => toggleExpanded(review.id)} aria-expanded={isExpanded}><span className="review-thumb" style={review.image ? { backgroundImage: `url(${productImageDisplayUrl(review.image)})` } : undefined}></span><span className="review-product-copy"><strong>{review.title}</strong><small>{review.sku} · Etsy #{review.etsyListingId}</small></span><span className={`change-badge ${review.changeType}`}><Icon size={14} />{changeLabels[review.changeType]}</span><span className="change-count">{review.changes.length ? `${review.changes.length} field${review.changes.length === 1 ? "" : "s"}` : "No changes"}</span>{review.reviewed && <span className="reviewed-badge"><Check size={13} />Reviewed</span>}{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
          {isExpanded && <div className="review-detail"><div className="review-diff-head"><span>Field</span><span>Previous Etsy import</span><span>Latest Etsy import</span></div>{review.changes.map((change) => <div className="review-diff-row" key={`${review.id}-${change.field}`}><strong>{change.label}</strong><p>{change.before}</p><p>{change.after}</p></div>)}{!review.changes.length && <div className="review-no-change"><CheckCircle2 size={18} /><span>This listing matches the previous Etsy import.</span></div>}<footer><a href={`https://www.etsy.com/listing/${review.etsyListingId}`} target="_blank" rel="noreferrer" className="button outline small">View on Etsy <ExternalLink size={13} /></a>{product && <button className="button outline small" onClick={() => onOpen(product)}>Open working copy</button>}{review.changeType !== "unchanged" && !review.reviewed && <button className="button lime small" onClick={() => void markReviewed(review.id)} disabled={Boolean(busy)}><Check size={14} />Mark reviewed</button>}</footer></div>}
        </article>;
      })}{!visible.length && <div className="empty"><CheckCircle2 size={30} /><strong>{data?.reviews.length ? "Nothing in this view" : "No review data yet"}</strong><span>{data?.reviews.length ? "Choose another filter or search." : "Run Import from Etsy once more to create the first change review."}</span></div>}</div>}
    </section>
  </main>;
}
