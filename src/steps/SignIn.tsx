import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Notice, Spinner } from "@/ui";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // The same words for a wrong email and a wrong password.
    if (error) setError(error.status === 400 || error.status === 401 ? "The email or password is not right." : "Could not sign in. Check your connection and try again.");
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>Set up a unit</h1>
      <p className="sub">Sign in with your WayTara account. You can set up units for sites you own or are assigned to.</p>
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error ? <Notice kind="bad">{error}</Notice> : null}
      <div className="actions">
        <button className="btn primary grow" type="submit" disabled={busy || !email || !password}>
          {busy ? <Spinner label="Signing in" /> : "Sign in"}
        </button>
      </div>
    </form>
  );
}
