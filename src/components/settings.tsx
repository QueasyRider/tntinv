"use client";

import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, LockKeyhole, PlugZap, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SecuritySettings } from "./security-settings";
import type { AppSettings, AppState } from "@/lib/types";

export interface SettingsPayload {
  settings: AppSettings;
  etsy?: { keystring?: string; sharedSecret?: string; shopId?: string };
  square?: { appId?: string; appSecret?: string; environment?: "sandbox" | "production"; locationId?: string };
}

interface SettingsProps {
  state: AppState;
  onSave: (payload: SettingsPayload) => void;
  onTest: (provider: "etsy" | "square") => void;
  onClearConnection: (provider: "etsy" | "square") => void;
  busy: string | null;
}

export function Settings({ state, onSave, onTest, onClearConnection, busy }: SettingsProps) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [siteName, setSiteName] = useState(state.settings.siteName);
  const [mode, setMode] = useState(state.settings.mode);
  const [publicBaseUrl, setPublicBaseUrl] = useState(state.settings.publicBaseUrl);
  const [etsyShopId, setEtsyShopId] = useState(state.settings.etsyShopId);
  const [etsyKey, setEtsyKey] = useState("");
  const [etsySecret, setEtsySecret] = useState("");
  const [squareEnvironment, setSquareEnvironment] = useState(state.settings.squareEnvironment);
  const [squareLocationId, setSquareLocationId] = useState(state.settings.squareLocationId);
  const [squareAppId, setSquareAppId] = useState("");
  const [squareSecret, setSquareSecret] = useState("");

  const save = () => onSave({
    settings: { siteName, mode, publicBaseUrl, etsyShopId, squareEnvironment, squareLocationId, setupComplete: state.settings.setupComplete },
    etsy: etsyKey || etsySecret ? { keystring: etsyKey, sharedSecret: etsySecret, shopId: etsyShopId } : undefined,
    square: squareAppId || squareSecret ? { appId: squareAppId, appSecret: squareSecret, environment: squareEnvironment, locationId: squareLocationId } : undefined,
  });

  return <main className="section-page settings-page">
    <header className="section-heading"><div><h1>SETTINGS</h1><p>Customize this workspace and manage the Etsy and Square apps for this business.</p></div><div className="security-note"><ShieldCheck size={20} /><span>Secrets never return to the browser after save</span></div></header>
    <section className="workspace-identity"><div><h2>Workspace identity</h2><p>This name appears throughout the app and on the sign-in screen.</p></div><label className="field"><span>Company or site name</span><input value={siteName} onChange={(event) => setSiteName(event.target.value)} maxLength={80} placeholder="Your company name" /></label></section>
    <section className="mode-switch"><div><h2>Workspace mode</h2><p>Demo exercises the workflow safely. Live calls the connected accounts.</p></div><div><button className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>Demo</button><button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Live</button></div></section>
    <section className="settings-grid">
      <article className="provider-settings">
        <header><span className="provider-icon etsy">E</span><div><h2>Etsy Open API v3</h2><p>Read-only listing access with OAuth 2.0 + PKCE</p></div><span className={`connection-state ${state.connections.etsy.status}`}><CheckCircle2 size={15} />{state.connections.etsy.status}</span></header>
        <div className="credential-status"><LockKeyhole size={16} /><span>{state.connections.etsy.hasCredentials ? "Credentials saved and encrypted" : "Credentials not saved"}</span></div>
        <label className="field"><span>API key keystring</span><input value={etsyKey} onChange={(event) => setEtsyKey(event.target.value)} placeholder={state.connections.etsy.hasCredentials ? "Saved — enter only to replace" : "Your existing Etsy keystring"} autoComplete="off" /></label>
        <label className="field"><span>Shared secret</span><div className="secret-input"><input type={showSecrets ? "text" : "password"} value={etsySecret} onChange={(event) => setEtsySecret(event.target.value)} placeholder={state.connections.etsy.hasCredentials ? "Saved — enter only to replace" : "Your existing Etsy shared secret"} autoComplete="new-password" /><button onClick={() => setShowSecrets(!showSecrets)} aria-label="Toggle secret visibility">{showSecrets ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label className="field"><span>Shop ID</span><input value={etsyShopId} onChange={(event) => setEtsyShopId(event.target.value)} placeholder="Detected automatically after connection test" /></label>
        <div className="callback"><span>OAuth callback URL</span><code>{publicBaseUrl.replace(/\/$/, "")}/api/oauth/etsy/callback</code></div>
        <p className="rotation-note">Enter replacement credentials and save to rotate them. The existing OAuth token will be cleared automatically.</p>
        <div className="provider-buttons"><a className={`button dark ${mode === "demo" || !state.connections.etsy.hasCredentials ? "disabled" : ""}`} href={mode === "live" && state.connections.etsy.hasCredentials ? "/api/oauth/etsy/start" : undefined}><PlugZap size={17} />Connect Etsy</a><button className="button outline" onClick={() => onTest("etsy")} disabled={busy === "test-etsy"}><KeyRound size={17} />{busy === "test-etsy" ? "Testing…" : "Test connection"}</button></div>
        {state.connections.etsy.hasCredentials && <button className="clear-connection" onClick={() => onClearConnection("etsy")} disabled={busy === "clear-etsy"}><RotateCcw size={14} />Disconnect and clear Etsy credentials</button>}
      </article>
      <article className="provider-settings">
        <header><span className="provider-icon square">□</span><div><h2>Square</h2><p>Server-side OAuth for Catalog and Inventory APIs</p></div><span className={`connection-state ${state.connections.square.status}`}><CheckCircle2 size={15} />{state.connections.square.status}</span></header>
        <div className="credential-status"><LockKeyhole size={16} /><span>{state.connections.square.hasCredentials ? "Credentials saved and encrypted" : "Credentials not saved"}</span></div>
        <label className="field"><span>Application ID</span><input value={squareAppId} onChange={(event) => setSquareAppId(event.target.value)} placeholder={state.connections.square.hasCredentials ? "Saved — enter only to replace" : "Your existing Square application ID"} autoComplete="off" /></label>
        <label className="field"><span>Application secret</span><div className="secret-input"><input type={showSecrets ? "text" : "password"} value={squareSecret} onChange={(event) => setSquareSecret(event.target.value)} placeholder={state.connections.square.hasCredentials ? "Saved — enter only to replace" : "Your existing Square application secret"} autoComplete="new-password" /></div></label>
        <label className="field"><span>Environment</span><select value={squareEnvironment} onChange={(event) => setSquareEnvironment(event.target.value as "sandbox" | "production")}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
        <label className="field"><span>Location ID</span><input value={squareLocationId} onChange={(event) => setSquareLocationId(event.target.value)} placeholder="Required for inventory counts" /></label>
        <div className="callback"><span>OAuth callback URL</span><code>{publicBaseUrl.replace(/\/$/, "")}/api/oauth/square/callback</code></div>
        <p className="rotation-note">Enter replacement credentials and save to rotate them. The existing OAuth token will be cleared automatically.</p>
        <div className="provider-buttons"><a className={`button dark ${mode === "demo" || !state.connections.square.hasCredentials ? "disabled" : ""}`} href={mode === "live" && state.connections.square.hasCredentials ? "/api/oauth/square/start" : undefined}><PlugZap size={17} />Connect Square</a><button className="button outline" onClick={() => onTest("square")} disabled={busy === "test-square"}><KeyRound size={17} />{busy === "test-square" ? "Testing…" : "Test connection"}</button></div>
        {state.connections.square.hasCredentials && <button className="clear-connection" onClick={() => onClearConnection("square")} disabled={busy === "clear-square"}><RotateCcw size={14} />Disconnect and clear Square credentials</button>}
      </article>
    </section>
    <section className="base-url"><label className="field"><span>Public app URL</span><input value={publicBaseUrl} onChange={(event) => setPublicBaseUrl(event.target.value)} placeholder="https://inventory.yourbusiness.com" /></label><p>This exact URL must match the callback URLs registered in the Etsy and Square developer apps.</p><a href="https://developers.etsy.com/documentation/essentials/authentication/" target="_blank" rel="noreferrer">Etsy OAuth docs <ExternalLink size={13} /></a><a href="https://developer.squareup.com/docs/oauth-api/overview" target="_blank" rel="noreferrer">Square OAuth docs <ExternalLink size={13} /></a></section>
    <footer className="settings-actions"><span><LockKeyhole size={16} />AES-256-GCM encrypted server-side credential store</span><button className="button lime" onClick={save} disabled={busy === "settings" || !siteName.trim()}><Save size={18} />{busy === "settings" ? "Saving…" : "Save settings"}</button></footer>
    <SecuritySettings />
  </main>;
}
