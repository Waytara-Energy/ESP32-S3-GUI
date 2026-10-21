import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Icon, Notice, Spinner, Wordmark } from "@/ui";

interface Point {
  icon: string;
  title: string;
  text: string;
}

/** What a person should know before using the page. */
const POINTS: Point[] = [
  { icon: "units", title: "Find your unit by Bluetooth", text: "Stand next to the unit. It appears on the radar by itself; pick it there." },
  { icon: "key", title: "Your account decides what you can do", text: "Customers see their unit and its Wi-Fi. WayTara staff work on the sites they are assigned to." },
  { icon: "setup", title: "Setting up a new unit?", text: "Hold the BOOT button on the unit for 3 seconds to open its setup, then sign in here." },
  { icon: "network", title: "Use Chrome or Edge", text: "On an Android phone or a computer, over https. Safari and iPhones cannot use Bluetooth." },
  { icon: "lock", title: "Private by design", text: "The link to the unit is encrypted. Wi-Fi passwords go straight to the unit and are never kept." },
];

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
    <div className="auth">
      <div className="auth-card">
        <section className="auth-info" aria-label="About this page">
          <img className="auth-logo" src="/logo-dark.png" alt="WayTara Energy" width={140} height={30} />
          <h2>Unit setup</h2>
          <p className="auth-lead">Find a WayTara monitoring unit, check it and set it up, from your phone or laptop.</p>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="auth-ico">
                  <Icon name={p.icon} />
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <small>{p.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-form">
          <form onSubmit={submit}>
            <div className="auth-brand">
              <Wordmark />
            </div>
            <h1>Welcome back</h1>
            <p className="sub">Please enter your details.</p>
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
            <p className="sub auth-foot">© {new Date().getFullYear()} WayTara Energy</p>
          </form>
        </section>
      </div>
    </div>
  );
}
