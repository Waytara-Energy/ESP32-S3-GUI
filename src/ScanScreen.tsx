import { useEffect, useState } from "react";
import { Radar } from "@/components/Radar";
import { applyTheme, readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import { useRadar } from "@/lib/use-radar";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Icon, Notice, Wordmark } from "@/ui";

/**
 * What a person sees until a unit is connected: only the radar. It starts by itself, units appear on it as they are heard, and picking one
 * here (not in the browser's list) connects to it. The menu and the pages appear once a unit has let the person in.
 */
export function ScanScreen({ onSignOut }: { onSignOut: () => void }) {
  const services = useServices();
  const { connect, connecting, connectingId, outcome, linkLost, error, remembered, email, openOffline, role } = useApp();
  const supported = services.bluetoothAvailable();
  const radar = useRadar(supported);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const next: ThemeChoice = dark ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  };
  const offlineUnits = remembered.filter((u) => u.equipmentId && u.label);
  const nothingHeard = radar.blips.length === 0;
  // a browser that can listen for nothing without its own chooser needs the unit added once
  const needsAdd = radar.listening !== null && !radar.listening.everyUnit;

  return (
    <div className="scan">
      <header className="scan-top">
        <Wordmark />
        <span className="grow" />
        <span className="sub who-text">{email}</span>
        <button className="btn small" onClick={toggle} aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}>
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        <button className="btn small" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="scan-main">
        <h1>{connecting ? "Connecting…" : "Looking for WayTara units"}</h1>
        <p className="sub">
          {connecting
            ? "Agreeing a secure link and getting your access."
            : nothingHeard
              ? "Stand next to the unit. It appears here when it is in range."
              : "Pick your unit on the radar."}
        </p>

        {!supported ? (
          <Notice kind="bad">
            This browser cannot use Bluetooth. Open this page in Chrome or Edge on an Android phone or a computer (not Safari, and not any browser on an iPhone), and make sure the address starts with https.
          </Notice>
        ) : (
          <>
            <Radar blips={radar.blips} remembered={remembered} busyId={connectingId} onPick={(b) => void connect({ id: b.id, name: b.name, rssi: b.rssi, device: b.device })} />

            {radar.blips.length > 0 ? (
              <ul className="list scan-list" aria-label="Units found">
                {radar.blips.map((b) => {
                  const mine = remembered.find((r) => r.name === b.name);
                  return (
                    <li key={b.id}>
                      <button className="item" onClick={() => void connect({ id: b.id, name: b.name, rssi: b.rssi, device: b.device })} disabled={connecting}>
                        <span>
                          <strong>{mine?.label ?? b.name}</strong>
                          <span className="meta">
                            {" "}
                            · {mine?.site ?? "new unit"} · {b.name}
                          </span>
                        </span>
                        <span className="meta">{b.device ? "Connect" : "Connect (the browser asks once)"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {error ? <Notice kind="bad">{error}</Notice> : null}
            {radar.error ? <Notice kind="bad">{radar.error}</Notice> : null}
            {linkLost ? <Notice kind="warn">The Bluetooth connection ended. The unit lets go of a phone that is quiet for 5 minutes. Pick it again to reconnect.</Notice> : null}
            {outcome && outcome.kind !== "ready" && outcome.kind !== "cancelled" ? <Notice kind={outcome.kind === "new_unit" ? "info" : "warn"}>{outcome.message}</Notice> : null}

            {needsAdd ? (
              <div className="card scan-note">
                <h2>{nothingHeard ? "Nothing in the list yet?" : "Not in the list?"}</h2>
                <p className="sub">
                  Your browser lets this page hear only the units it has been allowed to use before. The first time you use a unit, press <strong>Add a unit</strong> and confirm it in the browser's own window (it can only be asked once, by the browser). After that it appears here by itself and connects without that window.
                </p>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn primary" onClick={() => void radar.allow()} disabled={connecting}>
                    Add a unit
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {offlineUnits.length > 0 && (role === "admin" || role === "employee" || role === "site_engineer" || role === "customer") ? (
          <p className="sub scan-foot">
            Without Bluetooth:{" "}
            {offlineUnits.slice(0, 4).map((u, i) => (
              <span key={u.hw}>
                {i > 0 ? " · " : ""}
                <button className="btn link" onClick={() => openOffline({ equipmentId: u.equipmentId!, label: u.label!, site: u.site ?? "" })}>
                  {u.label}
                </button>
              </span>
            ))}
          </p>
        ) : null}
      </main>

      <footer className="footer">
        <span>Unit firmware: not connected</span>
        <span>© {new Date().getFullYear()} WayTara Energy</span>
      </footer>
    </div>
  );
}
