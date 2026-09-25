"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";

export function SecuritySettings() {
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password !== confirmation) { setMessage({ tone: "error", text: "The new passwords do not match." }); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/security/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentUsername, currentPassword, username, password }) });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Login could not be updated.");
      setCurrentUsername(username); setCurrentPassword(""); setPassword(""); setConfirmation("");
      setMessage({ tone: "success", text: "Administrator login updated. Your current browser remains signed in." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Login could not be updated." });
    } finally { setBusy(false); }
  }

  return <section className="security-settings"><header><ShieldCheck size={21} /><div><h2>Administrator login</h2><p>Replace the initial environment username and password with a database-backed login for this installation.</p></div></header><form onSubmit={submit}><label className="field"><span>Current username</span><input value={currentUsername} onChange={(event) => setCurrentUsername(event.target.value)} autoComplete="username" required /></label><label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label className="field"><span>New username</span><input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={80} autoComplete="username" required /></label><label className="field"><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} autoComplete="new-password" required /></label><label className="field"><span>Confirm new password</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} autoComplete="new-password" required /></label><button className="button dark" type="submit" disabled={busy}><KeyRound size={17} />{busy ? "Updating…" : "Update login"}</button></form>{message && <div className={`security-message ${message.tone}`} role="status">{message.text}</div>}<small>Keep the original environment credentials in your secure deployment records as an emergency bootstrap reference. Once a database login is saved, it takes precedence.</small></section>;
}
