"use client";

import { Boxes, ClipboardList, Clock3, LayoutDashboard, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { SiteBrandName } from "./site-brand-name";

export type View = "dashboard" | "inventory" | "preflight" | "imports" | "bulk" | "history" | "settings";
const nav = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "inventory" as const, label: "Inventory", icon: Boxes },
  { id: "preflight" as const, label: "Fix center", icon: ShieldCheck },
  { id: "imports" as const, label: "Import review", icon: ClipboardList },
  { id: "bulk" as const, label: "Bulk edit", icon: SlidersHorizontal },
  { id: "history" as const, label: "Export history", icon: Clock3 },
  { id: "settings" as const, label: "Settings", icon: Settings2 },
];

export function Sidebar({ view, siteName, onChange }: { view: View; siteName: string; onChange: (view: View) => void }) {
  return <aside className="sidebar">
    <button className="brand" onClick={() => onChange("dashboard")} aria-label={`${siteName} dashboard`}><SiteBrandName siteName={siteName} /><small>Inventory moves differently</small></button>
    <nav aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onChange(id)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></button>)}</nav>
  </aside>;
}
