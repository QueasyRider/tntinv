"use client";

import { Circle, LogOut } from "lucide-react";
import { siteInitials } from "@/lib/branding";
import type { ConnectionSummary } from "@/lib/types";

function Connector({ label, letter, connection }: { label: string; letter: string; connection: ConnectionSummary }) {
  const connected = connection.status === "connected" || connection.status === "demo";
  const statusLabel = connection.status === "demo" ? "Demo ready" : connection.status === "connected" ? "Connected" : connection.status === "configured" ? "Authorization required" : "Needs attention";
  return <div className="connector" title={connection.accountLabel}><span className={`provider-icon ${label.toLowerCase()}`}>{letter}</span><strong>{label}</strong><Circle size={9} fill={connected ? "#5e9b50" : "#e84082"} stroke="none" /><span>{statusLabel}</span></div>;
}

export function Topbar({ connections, siteName }: { connections: { etsy: ConnectionSummary; square: ConnectionSummary }; siteName: string }) {
  return <header className="topbar"><div className="crumb-flow">ETSY LISTINGS <span>→</span> LOCAL EDITS <span>→</span> SQUARE READY</div><div className="connections"><Connector label="Etsy" letter="E" connection={connections.etsy} /><Connector label="Square" letter="□" connection={connections.square} /></div><div className="profile"><span className="avatar">{siteInitials(siteName)}</span><div><strong title={siteName}>{siteName}</strong><small>Shop workspace</small></div><form action="/api/auth/logout" method="post"><button className="logout-button" type="submit" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button></form></div></header>;
}
