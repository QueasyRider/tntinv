"use client";

import { AlertTriangle, CheckCircle2, Clock3, Download, Upload } from "lucide-react";
import type { AppState } from "@/lib/types";

export function History({ state }: { state: AppState }) {
  return <main className="section-page"><header className="section-heading"><div><h1>EXPORT HISTORY</h1><p>Every transfer attempt, success, and recoverable error in one place.</p></div><span className="history-count"><Clock3 size={18} />{state.syncRuns.length} recorded runs</span></header>
    <section className="history-table"><div className="history-row head"><span>Direction</span><span>Started</span><span>Status</span><span>Selected</span><span>Successful</span><span>Errors</span></div>{state.syncRuns.map((run) => <div className="history-row" key={run.id}><span className="direction">{run.direction === "etsy_to_local" ? <Download size={17} /> : <Upload size={17} />}{run.direction === "etsy_to_local" ? "Etsy → Local" : "Local → Square"}</span><span>{new Date(run.startedAt).toLocaleString()}</span><span className={`run-status ${run.status}`}>{run.status === "completed" ? <CheckCircle2 size={15} /> : run.status === "running" ? <Clock3 size={15} /> : <AlertTriangle size={15} />}{run.status}</span><span>{run.selectedCount || "—"}</span><span>{run.successCount}</span><span>{run.errorCount || "—"}</span>{run.errors.length > 0 && <div className="run-errors">{run.errors.map((error) => <p key={error}>{error}</p>)}</div>}</div>)}{!state.syncRuns.length && <div className="empty"><Clock3 size={28} /><strong>No sync runs yet</strong><span>Import or export products to start the audit trail.</span></div>}</section>
  </main>;
}
