"use client";

import { Boxes, ClipboardList, Clock3, LayoutDashboard, Settings2, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";

export type View = "dashboard" | "inventory" | "preflight" | "imports" | "bulk" | "history" | "settings";
const nav = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "inventory" as const, label: "Inventory", icon: Boxes },
  { id: "preflight" as const, label: "Fix center", icon: ShieldCheck },
  { id: "imports" as const, label: "Import review", icon: ClipboardList },
  { id: "bulk" as const, label: "Bulk edit", icon: SlidersHorizontal },
  { id: "history" as const, label: "Export history", icon: Clock3 },
  { id: "settings" as const, label: "API settings", icon: Settings2 },
];

export function Sidebar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return <aside className="sidebar">
    <button className="brand" onClick={() => onChange("dashboard")} aria-label="Twisted and Thrifted dashboard"><span>TWISTED <em>&amp;</em></span><span>THRIFTED</span><small>Inventory moves differently</small></button>
    <nav aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onChange(id)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-art" aria-hidden="true"><Zap size={42} /></div>
  </aside>;
}
