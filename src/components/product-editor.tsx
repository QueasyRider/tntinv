"use client";

import { AlertTriangle, ArrowLeft, Check, GripVertical, ImagePlus, Save, Square, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { productImageDisplayUrl } from "@/lib/product-images";
import { hasUnavailableSku, UNAVAILABLE_SKU_ERROR } from "@/lib/sku";
import type { Activity, Product, ProductCopy, Variant } from "@/lib/types";

type Tab = "edit" | "preview" | "history";
type DiffKey = "title" | "description" | "priceCents" | "sku" | "category" | "isTaxable" | "tags" | "quantity";

const diffKeys: DiffKey[] = ["title", "description", "priceCents", "sku", "category", "isTaxable", "tags", "quantity"];
const MAX_PREPARED_IMAGE_BYTES = 1_300_000;
const MAX_IMAGE_EDGE = 1800;
const SQUARE_IMAGE_TYPES = new Set(["image/jpeg", "image/pjpeg", "image/png", "image/gif"]);
const SELECTABLE_IMAGE_TYPES = new Set([...SQUARE_IMAGE_TYPES, "image/webp"]);

const changed = (original: unknown, working: unknown) => JSON.stringify(original) !== JSON.stringify(working);
const imageStyle = (image?: string) => image ? { backgroundImage: `url(${productImageDisplayUrl(image)})` } : undefined;
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

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This photo could not be prepared.")), "image/jpeg", quality));
}

async function prepareProductPhoto(file: File): Promise<File> {
  if (!SELECTABLE_IMAGE_TYPES.has(file.type)) throw new Error(`${file.name}: use a JPEG, PNG, GIF, or WebP image.`);
  if (SQUARE_IMAGE_TYPES.has(file.type) && file.size <= MAX_PREPARED_IMAGE_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this image could not be opened.`);
  }

  try {
    const initialScale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let quality = 0.86;
    for (let attempt = 0; attempt < 9; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(`${file.name}: this browser could not prepare the image.`);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= MAX_PREPARED_IMAGE_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "product-photo";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
      }
      if (quality > 0.62) quality -= 0.1;
      else {
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
        quality = 0.82;
      }
    }
    throw new Error(`${file.name}: the photo is still too large after preparation.`);
  } finally {
    bitmap.close();
  }
}

export function ProductEditor({ product, activities, backLabel = "Inventory", onBack, onSave, onDelete, onExport, busy }: {
  product: Product; activities: Activity[]; onBack: () => void; onSave: (working: ProductCopy, ready: boolean) => Promise<void>;
  backLabel?: string; onDelete: () => Promise<void>; onExport: () => void; busy: string | null;
}) {
  const workingCopy = useMemo<ProductCopy>(() => ({
    ...product.working,
    images: product.working.images.length ? product.working.images : product.original.images,
  }), [product.original.images, product.working]);
  const [draft, setDraft] = useState<ProductCopy>(() => structuredClone(workingCopy));
  const [tab, setTab] = useState<Tab>("edit");
  const [imagePickerVariantId, setImagePickerVariantId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => changed(workingCopy, draft), [workingCopy, draft]);
  const differences = useMemo(() => diffKeys.filter((key) => changed(product.original[key], draft[key])), [product.original, draft]);
  const set = <K extends keyof ProductCopy>(key: K, value: ProductCopy[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateVariant = <K extends keyof Variant>(id: string, key: K, value: Variant[K]) => setDraft((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, [key]: value } : variant) }));
  const removeProductImage = (index: number) => setDraft((current) => {
    const removedImage = current.images[index];
    return {
      ...current,
      images: current.images.filter((_, item) => item !== index),
      variants: current.variants.map((variant) => variant.image === removedImage ? { ...variant, image: undefined } : variant),
    };
  });
  const addProductPhotos = async (files: FileList | null) => {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    if (draft.images.length + selectedFiles.length > 250) {
      setPhotoError("Square allows up to 250 images on a catalog item. Remove an image before adding more.");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoNotice(null);
    const uploaded: string[] = [];
    try {
      for (const file of selectedFiles) {
        const prepared = await prepareProductPhoto(file);
        const form = new FormData();
        form.set("image", prepared);
        const response = await fetch(`/api/products/${product.id}/images`, { method: "POST", body: form });
        const raw = await response.text();
        let result: { ok?: boolean; source?: string; error?: string } = {};
        try { result = raw ? JSON.parse(raw) as typeof result : {}; }
        catch { throw new Error(`${file.name}: the upload server returned an invalid response.`); }
        if (!response.ok || !result.ok || !result.source) throw new Error(result.error || `${file.name}: upload failed.`);
        uploaded.push(result.source);
      }
      setPhotoNotice(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added. Save the working copy to keep ${uploaded.length === 1 ? "it" : "them"}.`);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "The photo upload failed.");
    } finally {
      if (uploaded.length) setDraft((current) => ({ ...current, images: [...current.images, ...uploaded] }));
      setPhotoBusy(false);
    }
  };
  const imagePickerVariant = draft.variants.find((variant) => variant.id === imagePickerVariantId);
  const issues = [
    ...(hasUnavailableSku(draft) ? [UNAVAILABLE_SKU_ERROR] : []),
    ...(!draft.title.trim() ? ["Title is required"] : []),
    ...(!draft.sku.trim() ? ["SKU is required"] : []),
    ...(!draft.category.trim() ? ["Category is required"] : []),
  ];

  return <main className="editor-page">
    <div className="editor-breadcrumb"><button onClick={onBack}><ArrowLeft size={16} /> {backLabel}</button><span>/</span><span>{product.original.title}</span></div>
    <section className="editor-heading"><div><h1>{draft.title.toUpperCase()}</h1><span className={`draft-badge ${dirty ? "dirty" : ""}`}>{dirty ? "UNSAVED CHANGES" : product.status.replace("_", " ").toUpperCase()}</span></div><p>Edits here never change Etsy. ★</p><button className="button outline" onClick={onBack}><ArrowLeft size={16} /> Back to {backLabel.toLowerCase()}</button></section>
    <div className="editor-tabs"><button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>Edit working copy</button><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>Square preview <span>{differences.length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Sync history</button></div>
    {product.lastError && <div className="product-error-banner" role="alert"><AlertTriangle size={18} /><div><strong>This product needs attention</strong><span>{product.lastError}</span></div></div>}

    {tab === "edit" && <>
      <div className="compare-toolbar"><strong>Compare view:</strong><button className="active">Side by side</button><span>{differences.length} changed fields</span></div>
      <div className="editor-grid">
        <section className="compare-panel original"><header><span className="provider-icon etsy">E</span><div><h2>ETSY ORIGINAL — READ ONLY</h2><p>Your live Etsy listing. Nothing here can be edited.</p></div></header>
          <div className="original-media"><div className="large-product-image" style={{ backgroundImage: `url(${product.original.images[0]})` }}><span>{product.original.title}</span></div><div className="mini-images">{product.original.images.slice(0, 4).map((image, index) => <span key={image} style={{ backgroundImage: `url(${image})` }}>{index + 1}</span>)}</div></div>
          <div className="original-fields"><OriginalField label="Title" value={product.original.title} /><OriginalField label="Description" value={product.original.description} /><OriginalField label="Price" value={`$${(product.original.priceCents / 100).toFixed(2)}`} /><OriginalField label="SKU" value={product.original.sku} /><OriginalField label="Shop section" value={product.original.shopSection || "Not assigned"} /><OriginalField label="Etsy taxonomy" value={product.original.etsyTaxonomy || product.original.category} /><OriginalField label="Tags" value={product.original.tags.join(", ")} /><OriginalField label="Quantity" value={product.original.quantity} /></div>
        </section>
        <section className="compare-panel editable"><header><span className="provider-icon square">□</span><div><h2>SQUARE-READY VERSION</h2><p>Your local working copy. Safe to rewrite.</p></div></header>
          <div className="form-grid"><InputField label="Title *" value={draft.title} onChange={(value) => set("title", value)} className={changed(product.original.title, draft.title) ? "changed" : ""} /><label className={`field full ${changed(product.original.description, draft.description) ? "changed" : ""}`}><span>Description *</span><textarea value={draft.description} onChange={(event) => set("description", event.target.value)} /></label><InputField label="Price *" type="number" value={(draft.priceCents / 100).toFixed(2)} onChange={(value) => set("priceCents", Math.round(Number(value) * 100))} className={changed(product.original.priceCents, draft.priceCents) ? "changed" : ""} /><InputField label="SKU *" value={draft.sku} onChange={(value) => set("sku", value)} className={changed(product.original.sku, draft.sku) ? "changed" : ""} /><InputField label="Square category *" value={draft.category} onChange={(value) => set("category", value)} className={changed(product.original.category, draft.category) ? "changed" : ""} /><InputField label="Square category ID (optional override)" value={draft.squareCategoryId || ""} onChange={(value) => set("squareCategoryId", value)} /><label className={`tax-toggle ${changed(product.original.isTaxable, draft.isTaxable) ? "changed" : ""}`}><input type="checkbox" checked={draft.isTaxable} onChange={(event) => set("isTaxable", event.target.checked)} /><span className="tax-toggle-track" aria-hidden="true"><i></i></span><span className="tax-toggle-copy"><strong>Taxable in Square</strong><small>Turn off for products that should not be taxed.</small></span><b>{draft.isTaxable ? "Taxable" : "Non-taxable"}</b></label><InputField label="Tags (comma separated)" value={draft.tags.join(", ")} onChange={(value) => set("tags", value.split(",").map((tag) => tag.trim()).filter(Boolean))} className={`full ${changed(product.original.tags, draft.tags) ? "changed" : ""}`} /><InputField label="Quantity *" type="number" value={draft.quantity} onChange={(value) => set("quantity", Math.max(0, Number(value)))} className={changed(product.original.quantity, draft.quantity) ? "changed" : ""} />
            <div className="field full images-field"><span>Images</span><div>{draft.images.map((image, index) => <span key={`${image}-${index}`} className="editable-image" style={imageStyle(image)}><GripVertical size={13} /><button type="button" onClick={() => removeProductImage(index)} aria-label={`Remove photo ${index + 1}`}><X size={13} /></button></span>)}<input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={(event) => { void addProductPhotos(event.currentTarget.files); event.currentTarget.value = ""; }} /><button type="button" className="add-image" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}><ImagePlus size={22} /><small>{photoBusy ? "Adding…" : "Add photo"}</small></button></div>{photoError && <small className="photo-upload-message error" role="alert">{photoError}</small>}{photoNotice && !photoError && <small className="photo-upload-message" role="status">{photoNotice}</small>}</div>
          </div>
        </section>
        <aside className="preview-rail"><header><Square size={20} fill="currentColor" /><h2>SQUARE PREVIEW</h2></header><div className="preview-product"><div className="preview-image" style={imageStyle(draft.images[0])}></div><div><h3>{draft.title}</h3><strong>${(draft.priceCents / 100).toFixed(2)}</strong><span>{draft.category}</span></div></div><p className="preview-description">{draft.description}</p><h3>Variations ({draft.variants.length || 1})</h3><div className="preview-variants">{(draft.variants.length ? draft.variants : [{ id: "regular", name: "Regular", quantity: draft.quantity, priceCents: draft.priceCents, image: undefined }]).map((variant) => <div key={variant.id}><span className={`preview-variant-thumb ${variant.image ? "" : "empty"}`} style={imageStyle(variant.image)}>{variant.image ? "" : "—"}</span><span>{variant.name}</span><span>${(variant.priceCents / 100).toFixed(2)}</span><span>In stock: {variant.quantity}</span></div>)}</div><div className="total"><strong>Total inventory</strong><strong>{draft.variants.length ? draft.variants.reduce((sum, item) => sum + item.quantity, 0) : draft.quantity}</strong></div>{issues.length > 0 && <div className="validation"><AlertTriangle size={20} /><div><strong>{issues.length} validation {issues.length === 1 ? "issue" : "issues"}</strong><span>{issues[0]}</span></div></div>}<div className="mapping"><h3>Square settings</h3><div><span>Reporting category</span><strong>{draft.category}</strong></div><div><span>Tax status</span><strong>{draft.isTaxable ? "Taxable" : "Non-taxable"}</strong></div><div><span>Etsy listing ID</span><a href={`https://www.etsy.com/listing/${product.etsyListingId}`} target="_blank" rel="noreferrer">#{product.etsyListingId}</a></div><div><span>Square item ID</span><strong>{product.squareItemId || "Not exported yet"}</strong></div></div></aside>
      </div>
      <section className="variants-panel"><header><div><h2>Variants &amp; options</h2><small>Click a thumbnail to choose from the product photos.</small></div><button className="button outline small" onClick={() => set("variants", [...draft.variants, { id: crypto.randomUUID(), name: "New option", optionName: "Option", optionValue: "Value", sku: `${draft.sku}-${draft.variants.length + 1}`, priceCents: draft.priceCents, quantity: 0 }])}>+ Add variant</button></header><div className="variant-table"><div className="variant-row head"><span className="variant-thumb-cell">Image</span><span>Option name</span><span>Value</span><span>SKU</span><span>Price</span><span>Quantity</span><span></span></div>{draft.variants.map((variant) => <div className="variant-row" key={variant.id}><span className="variant-thumb-cell"><button className={`variant-image-button ${variant.image ? "assigned" : ""}`} onClick={() => setImagePickerVariantId(variant.id)} aria-label={`Choose a photo for ${variant.name}`} title="Choose variant photo">{variant.image ? <span className="variant-thumb" aria-hidden="true" style={imageStyle(variant.image)}></span> : <ImagePlus size={17} />}</button></span><input value={variant.optionName} onChange={(event) => updateVariant(variant.id, "optionName", event.target.value)} /><input value={variant.optionValue} onChange={(event) => { updateVariant(variant.id, "optionValue", event.target.value); updateVariant(variant.id, "name", event.target.value); }} /><input value={variant.sku} onChange={(event) => updateVariant(variant.id, "sku", event.target.value)} /><input type="number" value={(variant.priceCents / 100).toFixed(2)} onChange={(event) => updateVariant(variant.id, "priceCents", Math.round(Number(event.target.value) * 100))} /><input type="number" value={variant.quantity} onChange={(event) => updateVariant(variant.id, "quantity", Number(event.target.value))} /><button onClick={() => set("variants", draft.variants.filter((item) => item.id !== variant.id))} aria-label="Remove variant"><X size={16} /></button></div>)}</div></section>
    </>}

    {tab === "preview" && <section className="diff-view"><div className="diff-heading"><div><h2>ETSY ORIGINAL</h2><span>Read only</span></div><ArrowLeft size={24} className="diff-arrow" /><div><h2>SQUARE-READY VERSION</h2><span>{differences.length} fields changed</span></div></div>{diffKeys.map((key) => <div className={`diff-row ${differences.includes(key) ? "changed" : ""}`} key={key}><strong>{diffLabel(key)}</strong><div>{diffValue(product.original, key)}</div><div>{diffValue(draft, key)}</div></div>)}</section>}

    {tab === "history" && <section className="product-history"><h2>SYNC HISTORY</h2>{activities.filter((activity) => activity.productId === product.id).map((activity) => <div key={activity.id}><span>{new Date(activity.createdAt).toLocaleString()}</span><strong>{activity.title}</strong><p>{activity.detail}</p></div>)}{!activities.some((activity) => activity.productId === product.id) && <p>No product-specific history yet. The first save or export will appear here.</p>}</section>}

    {imagePickerVariant && <div className="modal-backdrop" role="presentation"><section className="variant-image-modal" role="dialog" aria-modal="true" aria-labelledby="variant-image-title"><header><div><h2 id="variant-image-title">CHOOSE VARIANT PHOTO</h2><p>{imagePickerVariant.name} · {imagePickerVariant.sku}</p></div><button className="icon-button" onClick={() => setImagePickerVariantId(null)} aria-label="Close image picker"><X size={18} /></button></header>{draft.images.length ? <div className="variant-image-grid">{draft.images.map((image, index) => <button key={`${image}-${index}`} className={imagePickerVariant.image === image ? "selected" : ""} onClick={() => { updateVariant(imagePickerVariant.id, "image", image); setImagePickerVariantId(null); }} aria-label={`Use product photo ${index + 1} for ${imagePickerVariant.name}`}><span style={imageStyle(image)}></span><small>Photo {index + 1}</small>{imagePickerVariant.image === image && <i><Check size={15} /></i>}</button>)}</div> : <div className="variant-image-empty"><ImagePlus size={28} /><strong>No product photos available</strong><span>Add a photo to the Square-ready version, then choose it here.</span></div>}<footer><button className="button outline" onClick={() => { updateVariant(imagePickerVariant.id, "image", undefined); setImagePickerVariantId(null); }} disabled={!imagePickerVariant.image}><Trash2 size={16} /> Remove variant photo</button><button className="button dark" onClick={() => setImagePickerVariantId(null)}>Cancel</button></footer></section></div>}

    <footer className="editor-actions"><span className="changed-key"><i></i>{differences.length} fields changed from Etsy</span><div><button className="button danger" onClick={() => void onDelete()} disabled={Boolean(busy)}><Trash2 size={17} /> Delete from app</button><button className="button outline" onClick={() => onSave(draft, false)} disabled={Boolean(busy)}><Save size={17} /> Save draft</button><button className="button lime" onClick={() => onSave(draft, true)} disabled={Boolean(busy)}><Check size={18} /> Mark ready</button><button className="button dark" onClick={() => { setTab("preview"); if (!dirty) onExport(); }} disabled={Boolean(busy)}><Upload size={17} />{dirty ? "Preview for Square" : "Export to Square"}</button></div></footer>
  </main>;
}
