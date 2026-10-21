import { useEffect, useState, type ReactNode } from "react";
import { NAV, canOpen, groups, levelName, roleName } from "@/lib/roles";
import { applyTheme, readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import { useApp } from "@/state";
import { Icon, Wordmark } from "@/ui";

/** The page frame, like the dashboard's: a sidebar of grouped pages (a drawer on a phone), the content, and a footer with the unit's firmware. */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { page, go, unit, device, role, email } = useApp();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  // the drawer closes when a page is chosen, and with the Escape key
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const toggleTheme = () => {
    const next: ThemeChoice = dark ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  };
  const ctx = { level: unit ? unit.level : null, role, hasDevice: !!device };
  const fw = unit?.state?.fw ?? unit?.fw ?? null;

  return (
    <div className="app">
      <div className="frame">
        <aside className={`side${open ? " open" : ""}`} aria-label="Pages">
          <div className="brand">
            <Wordmark />
          </div>
          <nav className="nav">
            {groups(NAV).map((g) => (
              <div key={g.name}>
                <div className="nav-group">{g.name}</div>
                {g.items.map((n) => {
                  const c = canOpen(n, ctx);
                  return (
                    <button
                      key={n.id}
                      className="nav-item"
                      aria-current={page === n.id ? "page" : undefined}
                      disabled={!c.ok}
                      title={c.ok ? undefined : c.reason}
                      onClick={() => {
                        go(n.id);
                        setOpen(false);
                      }}
                    >
                      <Icon name={n.id} />
                      <span>{n.label}</span>
                      {!c.ok ? (
                        <span className="lock" aria-label={c.reason}>
                          <Icon name="lock" size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <div>{email}</div>
            <div>
              {roleName(role)}
              {unit ? ` · ${levelName(unit.level)}` : ""}
            </div>
            <button className="btn link" onClick={onSignOut} style={{ marginTop: 6 }}>
              Sign out
            </button>
          </div>
        </aside>
        <div className={`backdrop${open ? " show" : ""}`} onClick={() => setOpen(false)} aria-hidden />

        <div className="main">
          <header className="topbar">
            <button className="btn menu-btn small" onClick={() => setOpen(true)} aria-label="Open the menu" aria-expanded={open}>
              <Icon name="menu" />
            </button>
            <div className="grow">
              {device ? (
                <span className="chip" title={`${device.label} · ${device.site}`}>
                  <span>
                    <strong>{device.label}</strong> · {device.site}
                  </span>
                  {unit ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
                </span>
              ) : (
                <span className="sub">{unit ? `Connected to ${unit.name}` : "No unit connected"}</span>
              )}
            </div>
            <button className="btn small" onClick={toggleTheme} aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"} title={dark ? "Light theme" : "Dark theme"}>
              <Icon name={dark ? "sun" : "moon"} />
            </button>
          </header>
          <main className="content" id="main">
            {children}
          </main>
        </div>
      </div>
      <footer className="footer">
        <span>Unit firmware: {fw ?? "not connected"}</span>
        <span>© {new Date().getFullYear()} WayTara Energy</span>
      </footer>
    </div>
  );
}
