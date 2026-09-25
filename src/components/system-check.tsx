"use client";

import { AlertTriangle, CheckCircle2, CircleX, RefreshCw, Settings2 } from "lucide-react";
import type { SystemHealth } from "@/lib/types";

const icons = { pass: CheckCircle2, warning: AlertTriangle, fail: CircleX };

export function SystemCheck({ health, onRefresh, onOpenSettings, busy }: {
  health: SystemHealth;
  onRefresh: () => void;
  onOpenSettings: () => void;
  busy: string | null;
}) {
  const failures = health.checks.filter((check) => check.status === "fail").length;
  const warnings = health.checks.filter((check) => check.status === "warning").length;
  return <main className="section-page system-page">
    <header className="section-heading"><div><h1>SYSTEM CHECK</h1><p>Verify this installation without revealing any saved secret values.</p></div><div className="system-actions"><button className="button outline" onClick={onOpenSettings}><Settings2 size={17} />Settings</button><button className="button dark" onClick={onRefresh} disabled={busy === "system-health"}><RefreshCw size={17} className={busy === "system-health" ? "spin" : ""} />{busy === "system-health" ? "Checking…" : "Run checks"}</button></div></header>
    <div className={`system-summary ${failures ? "fail" : warnings ? "warning" : "pass"}`}><ShieldStatus failures={failures} warnings={warnings} /><div><strong>{failures ? `${failures} blocking ${failures === 1 ? "issue" : "issues"}` : warnings ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : "Installation ready"}</strong><span>Database schema v{health.schemaVersion} of v{health.latestSchemaVersion} · checked {new Date(health.checkedAt).toLocaleString()}</span></div></div>
    <section className="system-check-list">{health.checks.map((check) => {
      const Icon = icons[check.status];
      return <article key={check.id} className={check.status}><Icon size={21} /><div><h2>{check.label}</h2><p>{check.detail}</p>{check.action && <small>{check.action}</small>}</div><span>{check.status}</span></article>;
    })}</section>
  </main>;
}

function ShieldStatus({ failures, warnings }: { failures: number; warnings: number }) {
  if (failures) return <CircleX size={28} />;
  if (warnings) return <AlertTriangle size={28} />;
  return <CheckCircle2 size={28} />;
}
