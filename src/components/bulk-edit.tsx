"use client";

import { Check, Percent, Replace, Tags, X } from "lucide-react";
import { useState } from "react";
import { productImageDisplayUrl } from "@/lib/product-images";
import type { Product } from "@/lib/types";

export interface BulkOperation { type: string; value?: string; value2?: string }

export function BulkEdit({ products, initialSelected, onApply, onClose, modal = false, busy }: {
  products: Product[]; initialSelected: Set<string>; onApply: (ids: string[], operation: BulkOperation) => void;
  onClose?: () => void; modal?: boolean; busy: boolean;
}) {
  const [ids, setIds] = useState<Set<string>>(new Set(initialSelected));
  const [type, setType] = useState("price_percent");
  const [value, setValue] = useState("10");
  const [value2, setValue2] = useState("");
  const toggle = (id: string) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); setIds(next); };
  const content = <section className={`bulk-panel ${modal ? "modal-panel" : "page-panel"}`}>
    <header><div><h1>BULK EDIT</h1><p>Change the working copies only. Etsy stays untouched.</p></div>{onClose && <button className="icon-button" onClick={onClose} aria-label="Close bulk editor"><X size={20} /></button>}</header>
    <div className="bulk-body"><div className="bulk-products"><div className="bulk-select-head"><strong>{ids.size} selected</strong><button onClick={() => setIds(ids.size === products.length ? new Set() : new Set(products.map((product) => product.id)))}>{ids.size === products.length ? "Clear all" : "Select all"}</button></div>{products.map((product) => <label key={product.id} className={ids.has(product.id) ? "selected" : ""}><input type="checkbox" checked={ids.has(product.id)} onChange={() => toggle(product.id)} /><span className="mini-thumb" style={{ backgroundImage: `url(${productImageDisplayUrl(product.working.images[0] || product.original.images[0])})` }}></span><span><strong>{product.working.title}</strong><small>{product.working.sku} · ${(product.working.priceCents / 100).toFixed(2)}</small></span></label>)}</div>
      <div className="bulk-actions"><h2>Choose one change</h2><div className="bulk-action-tabs"><button className={type === "price_percent" ? "active" : ""} onClick={() => { setType("price_percent"); setValue("10"); }}><Percent size={18} />Price</button><button className={type === "category" ? "active" : ""} onClick={() => { setType("category"); setValue(""); }}><Tags size={18} />Category</button><button className={type === "quantity" ? "active" : ""} onClick={() => { setType("quantity"); setValue("0"); }}><Check size={18} />Quantity</button><button className={type === "find_replace" ? "active" : ""} onClick={() => { setType("find_replace"); setValue(""); }}><Replace size={18} />Find &amp; replace</button></div>
        {type === "price_percent" && <label className="field"><span>Adjust price by percent</span><div className="input-suffix"><input type="number" value={value} onChange={(event) => setValue(event.target.value)} /><span>%</span></div><small>Use a negative number to reduce prices.</small></label>}
        {type === "category" && <label className="field"><span>New Square-ready category</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. Vintage apparel" /></label>}
        {type === "quantity" && <label className="field"><span>Set quantity</span><input type="number" min="0" value={value} onChange={(event) => setValue(event.target.value)} /><small>For products with multiple variants, edit variant quantities individually.</small></label>}
        {type === "find_replace" && <><label className="field"><span>Find in title &amp; description</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Text to find" /></label><label className="field"><span>Replace with</span><input value={value2} onChange={(event) => setValue2(event.target.value)} placeholder="Replacement text" /></label></>}
        <div className="bulk-summary"><strong>Preview</strong><p>This will update {ids.size} local working cop{ids.size === 1 ? "y" : "ies"}. Products will return to Needs review.</p></div><button className="button lime full-button" disabled={!ids.size || busy || !value} onClick={() => onApply([...ids], { type, value, value2 })}>{busy ? "Applying…" : `Apply to ${ids.size} product${ids.size === 1 ? "" : "s"}`}</button>
      </div></div>
  </section>;
  return modal ? <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Bulk edit products">{content}</div> : content;
}
