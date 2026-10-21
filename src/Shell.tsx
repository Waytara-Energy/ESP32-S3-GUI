import { useEffect, useState, type ReactNode } from "react";
import { Pill } from "@/components/kit";
import { NAV, canOpen, groups, levelName, roleName } from "@/lib/roles";
import { applyTheme, readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import { useApp } from "@/state";
import { Icon, Wordmark } from "@/ui";

/**
 * The console frame: a menu of grouped pages (a drawer on a phone), a header that always says which device you are looking at and how you are
 * connected, the page, and a footer that always shows the unit's firmware version. The page scrolls; the header and the footer stay.
 */
export function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { page, go, unit, device, role, email, offline, disconnect, closeOffline, pendingRestart, restartUnit } = useApp();
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  async function restart() {
    setRestarting(true);
    setRestartError(null);
    try {
      await restartUnit();
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : "Could not restart the unit.");
    } finally {
      setRestarting(false);
    }
  }
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  // the drawer closes with the Escape key
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

        <div className={`main${pendingRestart.length > 0 ? " has-bar" : ""}`}>
          <header className="topbar">
            <button className="btn menu-btn small" onClick={() => setOpen(true)} aria-label="Open the menu" aria-expanded={open}>
              <Icon name="menu" />
            </button>
            <div className="grow">
              {device ? (
                <span className="devchip" title={`${device.label} · ${device.site}`}>
                  <strong>{device.label}</strong>
                  <span className="site">{device.site}</span>
                </span>
              ) : (
                <span className="devchip">
                  <strong>{unit ? unit.name : "No unit"}</strong>
                </span>
              )}
              {unit ? <Pill tone="ok">Bluetooth connected</Pill> : offline ? <Pill>Without Bluetooth</Pill> : null}
              {unit ? <Pill tone="info">{levelName(unit.level)}</Pill> : null}
            </div>
            {unit || offline ? (
              <button className="btn small" onClick={() => (unit ? disconnect() : closeOffline())}>
                {unit ? "Disconnect" : "Back to the radar"}
              </button>
            ) : null}
            <button className="btn small" onClick={toggleTheme} aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"} title={dark ? "Light theme" : "Dark theme"}>
              <Icon name={dark ? "sun" : "moon"} />
            </button>
          </header>
          {pendingRestart.length > 0 ? (
            <div className="restartbar" role="status">
              <div className="grow">
                <strong>Saved: {pendingRestart.join(", ")}.</strong>{" "}
                {unit && unit.level >= 3
                  ? "Save everything you want to change, then restart the unit once to apply it all. Readings it has not sent yet are lost."
                  : unit
                    ? "The unit takes this up by itself. Restarting it needs service access."
                    : "The unit takes this up by itself. Connect over Bluetooth to restart it and apply it at once."}
                {restartError ? <span className="restartbar-err"> {restartError}</span> : null}
              </div>
              {unit && unit.level >= 3 ? (
                <button className="btn primary small" onClick={restart} disabled={restarting}>
                  {restarting ? "Restarting…" : "Restart the unit now"}
                </button>
              ) : null}
            </div>
          ) : null}
          <main className="content" id="main">
            {children}
          </main>
        </div>
      </div>
      <footer className="footer">
        <span className="fw">
          <i className={`dot${unit ? " on" : ""}`} aria-hidden />
          Unit firmware: <b>{fw ?? "not connected"}</b>
          {unit ? <span>· encrypted Bluetooth link</span> : null}
        </span>
        <span>© {new Date().getFullYear()} WayTara Energy</span>
      </footer>
    </div>
  );
}
