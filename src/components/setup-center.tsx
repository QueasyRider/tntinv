"use client";

import { ArrowRight, Check, CircleAlert, Database, KeyRound, PlugZap, Settings2, ShieldCheck } from "lucide-react";
import type { AppState } from "@/lib/types";

export function SetupCenter({ state, onOpenSettings, onOpenSystem, onFinish, busy }: {
  state: AppState;
  onOpenSettings: () => void;
  onOpenSystem: () => void;
  onFinish: () => void;
  busy: string | null;
}) {
  const health = state.systemHealth;
  const coreIds = new Set(["database", "migrations", "encryption", "login", "public-url", "branding"]);
  const coreChecks = health.checks.filter((check) => coreIds.has(check.id));
  const connections = health.checks.filter((check) => check.id === "etsy" || check.id === "square");
  const blocking = coreChecks.filter((check) => check.status === "fail");
  const passed = health.checks.filter((check) => check.status === "pass").length;
  const canFinish = blocking.length === 0;

  return <main className="section-page setup-page">
    <header className="section-heading"><div><h1>SETUP GUIDE</h1><p>Prepare this installation for one business without exposing credentials.</p></div><div className="setup-progress"><strong>{passed}/{health.checks.length}</strong><span>checks passing</span></div></header>
    <div className="setup-banner"><ShieldCheck size={25} /><div><strong>Each business should use its own deployment and database.</strong><span>This installation is private to {state.settings.siteName}. Etsy and Square data stays isolated from every other business.</span></div></div>
    <section className="setup-steps">
      <article className={blocking.length ? "setup-step needs-action" : "setup-step complete"}>
        <header><span>1</span><div><h2>Secure the installation</h2><p>Database, encryption, login, public URL, and schema.</p></div>{blocking.length ? <CircleAlert size={21} /> : <Check size={21} />}</header>
        <div className="setup-check-list">{coreChecks.map((check) => <div key={check.id} className={check.status}><span></span><strong>{check.label}</strong><small>{check.detail}</small></div>)}</div>
        <button className="button outline" onClick={onOpenSystem}><Database size={17} />Open system check</button>
      </article>
      <article className={connections.every((check) => check.status === "pass") ? "setup-step complete" : "setup-step needs-action"}>
        <header><span>2</span><div><h2>Connect the business</h2><p>Set the workspace name and authorize Etsy and Square.</p></div>{connections.every((check) => check.status === "pass") ? <Check size={21} /> : <PlugZap size={21} />}</header>
        <div className="setup-check-list">{connections.map((check) => <div key={check.id} className={check.status}><span></span><strong>{check.label}</strong><small>{check.detail}</small></div>)}</div>
        <button className="button outline" onClick={onOpenSettings}><Settings2 size={17} />Open settings</button>
      </article>
      <article className={`setup-step ${canFinish ? "complete" : "needs-action"}`}>
        <header><span>3</span><div><h2>Finish and test</h2><p>Complete setup, then test one product before a full transfer.</p></div><KeyRound size={21} /></header>
        <ol><li>Run both connection tests.</li><li>Import one Etsy listing.</li><li>Review it in Fix center and Square Preview.</li><li>Export that listing and confirm it in Square.</li></ol>
        <button className="button lime" onClick={onFinish} disabled={!canFinish || busy === "complete-setup"}>{busy === "complete-setup" ? "Finishing…" : state.settings.setupComplete ? "Setup already completed" : "Finish setup"}<ArrowRight size={17} /></button>
        {!canFinish && <small className="setup-blocked">Resolve {blocking.length} blocking system {blocking.length === 1 ? "check" : "checks"} first.</small>}
      </article>
    </section>
  </main>;
}
