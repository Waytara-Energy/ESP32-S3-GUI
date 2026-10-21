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
  { icon: "units", title: "Find your unit", text: "Stand next to it. It shows up on the radar by itself." },
  { icon: "key", title: "Your account sets your access", text: "Customers see their unit and Wi-Fi. Staff work on their assigned sites." },
  { icon: "setup", title: "New unit?", text: "Hold the BOOT button for 3 seconds, then sign in." },
  { icon: "network", title: "Chrome or Edge", text: "On Android or a computer. Safari and iPhones cannot use Bluetooth." },
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
          <p className="auth-eyebrow">Unit setup</p>
          <h2>
            <span>Find it.</span> <span>Check it.</span> <span>Set it up.</span>
          </h2>
          <p className="auth-lead">Work with your WayTara monitoring unit from your phone or laptop.</p>
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
          <p className="auth-note">
            <Icon name="lock" size={15} /> The link to the unit is encrypted. Wi-Fi passwords are never kept.
          </p>
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
          </form>
          <p className="sub auth-foot">© {new Date().getFullYear()} WayTara Energy</p>
        </section>
      </div>
    </div>
  );
}
