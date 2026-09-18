"use client";

import { AlertTriangle, ArrowLeft, Check, GripVertical, ImagePlus, Save, Square, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { hasUnavailableSku, UNAVAILABLE_SKU_ERROR } from "@/lib/sku";
import type { Activity, Product, ProductCopy, Variant } from "@/lib/types";

type Tab = "edit" | "preview" | "history";
type DiffKey = "title" | "description" | "priceCents" | "sku" | "category" | "isTaxable" | "tags" | "quantity";

const diffKeys: DiffKey[] = ["title", "description", "priceCents", "sku", "category", "isTaxable", "tags", "quantity"];

const changed = (original: unknown, working: unknown) => JSON.stringify(original) !== JSON.stringify(working);
const imageStyle = (image?: string) => image ? { backgroundImage: `url(${image})` } : undefined;
const diffLabel = (key: DiffKey) => key === "priceCents" ? "Price" : key === "isTaxable" ? "Tax status" : key[0].toUpperCase() + key.slice(1);
const diffValue = (copy: ProductCopy, key: DiffKey) => key === "priceCents"
  ? `$${(Number(copy[key]) / 100).toFixed(2)}`
  : key === "isTaxable"
    ? (copy[key] ? "Taxable" : "Non-taxable")
    : Array.isArray(copy[key]) ? (copy[key] as string[]).join(", ") : String(copy[key]);

function OriginalField({ label, value }: { label: string; value: string | number }) {
  return <div className="original-field"><label>{label}</label><div>{value || "—"}</div></div>;
}

function InputField({ label, value, onChange, type = "text", className = "" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function ProductEditor({ product, activities, onBack, onSave, onExport, busy }: {
  product: Product; activities: Activity[]; onBack: () => void; onSave: (working: ProductCopy, ready: boolean) => Promise<void>;
  onExport: () => void; busy: string | null;
}) {
  const workingCopy = useMemo<ProductCopy>(() => ({
    ...product.working,
    images: product.working.images.length ? product.working.images : product.original.images,
  }), [product.original.images, product.working]);
  const [draft, setDraft] = useState<ProductCopy>(() => structuredClone(workingCopy));
  const [tab, setTab] = useState<Tab>("edit");
  const dirty = useMemo(() => changed(workingCopy, draft), [workingCopy, draft]);
  const differences = useMemo(() => diffKeys.filter((key) => changed(product.original[key], draft[key])), [product.original, draft]);
  const set = <K extends keyof ProductCopy>(key: K, value: ProductCopy[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateVariant = (id: string, key: keyof Variant, value: string | number) => setDraft((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, [key]: value } : variant) }));
  const issues = [
    ...(hasUnavailableSku(draft) ? [UNAVAILABLE_SKU_ERROR] : []),
    ...(!draft.title.trim() ? ["Title is required"] : []),
    ...(!draft.sku.trim() ? ["SKU is required"] : []),
    ...(!draft.category.trim() ? ["Category is required"] : []),
  ];

  return <main className="editor-page">
    <div className="editor-breadcrumb"><button onClick={onBack}><ArrowLeft size={16} /> Inventory</button><span>/</span><span>{product.original.title}</span></div>
    <section className="editor-heading"><div><h1>{draft.title.toUpperCase()}</h1><span className={`draft-badge ${dirty ? "dirty" : ""}`}>{dirty ? "UNSAVED CHANGES" : product.status.replace("_", " ").toUpperCase()}</span></div><p>Edits here never change Etsy. ★</p><button className="button outline" onClick={onBack}><ArrowLeft size={16} /> Back to inventory</button></section>
    <div className="editor-tabs"><button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>Edit working copy</button><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>Square preview <span>{differences.length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Sync history</button></div>

    {tab === "edit" && <>
      <div className="compare-toolbar"><strong>Compare view:</strong><button className="active">Side by side</button><span>{differences.length} changed fields</span></div>
      <div className="editor-grid">
        <section className="compare-panel original"><header><span className="provider-icon etsy">E</span><div><h2>ETSY ORIGINAL — READ ONLY</h2><p>Your live Etsy listing. Nothing here can be edited.</p></div></header>
          <div className="original-media"><div className="large-product-image" style={{ backgroundImage: `url(${product.original.images[0]})` }}><span>{product.original.title}</span></div><div className="mini-images">{product.original.images.slice(0, 4).map((image, index) => <span key={image} style={{ backgroundImage: `url(${image})` }}>{index + 1}</span>)}</div></div>
          <div className="original-fields"><OriginalField label="Title" value={product.original.title} /><OriginalField label="Description" value={product.original.description} /><OriginalField label="Price" value={`$${(product.original.priceCents / 100).toFixed(2)}`} /><OriginalField label="SKU" value={product.original.sku} /><OriginalField label="Shop section" value={product.original.shopSection || "Not assigned"} /><OriginalField label="Etsy taxonomy" value={product.original.etsyTaxonomy || product.original.category} /><OriginalField label="Tags" value={product.original.tags.join(", ")} /><OriginalField label="Quantity" value={product.original.quantity} /></div>
        </section>
        <section className="compare-panel editable"><header><span className="provider-icon square">□</span><div><h2>SQUARE-READY VERSION</h2><p>Your local working copy. Safe to rewrite.</p></div></header>
          <div className="form-grid"><InputField label="Title *" value={draft.title} onChange={(value) => set("title", value)} className={changed(product.original.title, draft.title) ? "changed" : ""} /><label className={`field full ${changed(product.original.description, draft.description) ? "changed" : ""}`}><span>Description *</span><textarea value={draft.description} onChange={(event) => set("description", event.target.value)} /></label><InputField label="Price *" type="number" value={(draft.priceCents / 100).toFixed(2)} onChange={(value) => set("priceCents", Math.round(Number(value) * 100))} className={changed(product.original.priceCents, draft.priceCents) ? "changed" : ""} /><InputField label="SKU *" value={draft.sku} onChange={(value) => set("sku", value)} className={changed(product.original.sku, draft.sku) ? "changed" : ""} /><InputField label="Square category *" value={draft.category} onChange={(value) => set("category", value)} className={changed(product.original.category, draft.category) ? "changed" : ""} /><InputField label="Square category ID (optional override)" value={draft.squareCategoryId || ""} onChange={(value) => set("squareCategoryId", value)} /><label className={`tax-toggle ${changed(product.original.isTaxable, draft.isTaxable) ? "changed" : ""}`}><input type="checkbox" checked={draft.isTaxable} onChange={(event) => set("isTaxable", event.target.checked)} /><span className="tax-toggle-track" aria-hidden="true"><i></i></span><span className="tax-toggle-copy"><strong>Taxable in Square</strong><small>Turn off for products that should not be taxed.</small></span><b>{draft.isTaxable ? "Taxable" : "Non-taxable"}</b></label><InputField label="Tags (comma separated)" value={draft.tags.join(", ")} onChange={(value) => set("tags", value.split(",").map((tag) => tag.trim()).filter(Boolean))} className={`full ${changed(product.original.tags, draft.tags) ? "changed" : ""}`} /><InputField label="Quantity *" type="number" value={draft.quantity} onChange={(value) => set("quantity", Math.max(0, Number(value)))} className={changed(product.original.quantity, draft.quantity) ? "changed" : ""} />
            <div className="field full images-field"><span>Images</span><div>{draft.images.map((image, index) => <span key={`${image}-${index}`} className="editable-image" style={{ backgroundImage: `url(${image})` }}><GripVertical size={13} /><button onClick={() => set("images", draft.images.filter((_, item) => item !== index))} aria-label="Remove image"><X size={13} /></button></span>)}<button className="add-image" title="Image URL import is available from Etsy"><ImagePlus size={22} /><small>From Etsy</small></button></div></div>
          </div>
        </section>
        <aside className="preview-rail"><header><Square size={20} fill="currentColor" /><h2>SQUARE PREVIEW</h2></header><div className="preview-product"><div className="preview-image" style={{ backgroundImage: `url(${draft.images[0]})` }}></div><div><h3>{draft.title}</h3><strong>${(draft.priceCents / 100).toFixed(2)}</strong><span>{draft.category}</span></div></div><p className="preview-description">{draft.description}</p><h3>Variations ({draft.variants.length || 1})</h3><div className="preview-variants">{(draft.variants.length ? draft.variants : [{ id: "regular", name: "Regular", quantity: draft.quantity, priceCents: draft.priceCents }]).map((variant) => <div key={variant.id}><span>{variant.name}</span><span>${(variant.priceCents / 100).toFixed(2)}</span><span>In stock: {variant.quantity}</span></div>)}</div><div className="total"><strong>Total inventory</strong><strong>{draft.variants.length ? draft.variants.reduce((sum, item) => sum + item.quantity, 0) : draft.quantity}</strong></div>{issues.length > 0 && <div className="validation"><AlertTriangle size={20} /><div><strong>{issues.length} validation {issues.length === 1 ? "issue" : "issues"}</strong><span>{issues[0]}</span></div></div>}<div className="mapping"><h3>Square settings</h3><div><span>Reporting category</span><strong>{draft.category}</strong></div><div><span>Tax status</span><strong>{draft.isTaxable ? "Taxable" : "Non-taxable"}</strong></div><div><span>Etsy listing ID</span><a href={`https://www.etsy.com/listing/${product.etsyListingId}`} target="_blank" rel="noreferrer">#{product.etsyListingId}</a></div><div><span>Square item ID</span><strong>{product.squareItemId || "Not exported yet"}</strong></div></div></aside>
      </div>
      <section className="variants-panel"><header><h2>Variants &amp; options</h2><button className="button outline small" onClick={() => set("variants", [...draft.variants, { id: crypto.randomUUID(), name: "New option", optionName: "Option", optionValue: "Value", sku: `${draft.sku}-${draft.variants.length + 1}`, priceCents: draft.priceCents, quantity: 0 }])}>+ Add variant</button></header><div className="variant-table"><div className="variant-row head"><span className="variant-thumb-cell">Image</span><span>Option name</span><span>Value</span><span>SKU</span><span>Price</span><span>Quantity</span><span></span></div>{draft.variants.map((variant) => <div className="variant-row" key={variant.id}><span className="variant-thumb-cell">{variant.image ? <span className="variant-thumb" role="img" aria-label={`${variant.name} Etsy thumbnail`} style={imageStyle(variant.image)}></span> : <span className="variant-thumb-empty" aria-label={`${variant.name} has no Etsy thumbnail`}>—</span>}</span><input value={variant.optionName} onChange={(event) => updateVariant(variant.id, "optionName", event.target.value)} /><input value={variant.optionValue} onChange={(event) => { updateVariant(variant.id, "optionValue", event.target.value); updateVariant(variant.id, "name", event.target.value); }} /><input value={variant.sku} onChange={(event) => updateVariant(variant.id, "sku", event.target.value)} /><input type="number" value={(variant.priceCents / 100).toFixed(2)} onChange={(event) => updateVariant(variant.id, "priceCents", Math.round(Number(event.target.value) * 100))} /><input type="number" value={variant.quantity} onChange={(event) => updateVariant(variant.id, "quantity", Number(event.target.value))} /><button onClick={() => set("variants", draft.variants.filter((item) => item.id !== variant.id))} aria-label="Remove variant"><X size={16} /></button></div>)}</div></section>
    </>}

    {tab === "preview" && <section className="diff-view"><div className="diff-heading"><div><h2>ETSY ORIGINAL</h2><span>Read only</span></div><ArrowLeft size={24} className="diff-arrow" /><div><h2>SQUARE-READY VERSION</h2><span>{differences.length} fields changed</span></div></div>{diffKeys.map((key) => <div className={`diff-row ${differences.includes(key) ? "changed" : ""}`} key={key}><strong>{diffLabel(key)}</strong><div>{diffValue(product.original, key)}</div><div>{diffValue(draft, key)}</div></div>)}</section>}

    {tab === "history" && <section className="product-history"><h2>SYNC HISTORY</h2>{activities.filter((activity) => activity.productId === product.id).map((activity) => <div key={activity.id}><span>{new Date(activity.createdAt).toLocaleString()}</span><strong>{activity.title}</strong><p>{activity.detail}</p></div>)}{!activities.some((activity) => activity.productId === product.id) && <p>No product-specific history yet. The first save or export will appear here.</p>}</section>}

    <footer className="editor-actions"><span className="changed-key"><i></i>{differences.length} fields changed from Etsy</span><div><button className="button outline" onClick={() => onSave(draft, false)} disabled={Boolean(busy)}><Save size={17} /> Save draft</button><button className="button lime" onClick={() => onSave(draft, true)} disabled={Boolean(busy)}><Check size={18} /> Mark ready</button><button className="button dark" onClick={() => { setTab("preview"); if (!dirty) onExport(); }} disabled={Boolean(busy)}><Upload size={17} />{dirty ? "Preview for Square" : "Export to Square"}</button></div></footer>
  </main>;
}
