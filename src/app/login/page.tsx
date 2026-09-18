import { LockKeyhole, ShieldCheck } from "lucide-react";
import { isAuthConfigured } from "@/lib/session";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid: "That username or password is not correct.",
  required: "Sign in to continue.",
  "not-configured": "Login is not configured yet. Add the required private settings in Vercel, then redeploy.",
};

function safeNext(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const configured = isAuthConfigured();
  const error = params.error ? errorMessages[params.error] : null;

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><span>TWISTED <em>&amp;</em></span><span>THRIFTED</span><small>Inventory moves differently</small></div>
      <div className="login-lock"><LockKeyhole size={28} /></div>
      <h1>SHOP ACCESS</h1>
      <p>Sign in to manage the Etsy-to-Square inventory workspace.</p>
      {!configured && <div className="login-alert">Login setup is incomplete. Add <code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD</code>, and <code>SESSION_SECRET</code> in Vercel.</div>}
      {error && <div className="login-error" role="alert">{error}</div>}
      <form action="/api/auth/login" method="post" className="login-form">
        <input type="hidden" name="next" value={safeNext(params.next)} />
        <label><span>Username</span><input name="username" type="text" autoComplete="username" required autoFocus /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="button lime" type="submit"><ShieldCheck size={18} /> Sign in securely</button>
      </form>
      <small className="login-note">Your Etsy and Square credentials remain encrypted and server-side.</small>
    </section>
  </main>;
}
