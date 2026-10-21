import { useCallback, useEffect, useMemo, useState } from "react";
import type { JoinResult, Network as Net } from "@/ble/unit-link";
import { signalLabel } from "@/lib/messages";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, SignalBars, Spinner } from "@/ui";

/** One row per network name, the strongest first. */
export function tidyNetworks(list: Net[]): Net[] {
  const best = new Map<string, Net>();
  for (const n of list) {
    if (!n.s) continue;
    const prev = best.get(n.s);
    if (!prev || n.r > prev.r) best.set(n.s, n);
  }
  return [...best.values()].sort((a, b) => b.r - a.r);
}

/** The unit's Wi-Fi: what it is joined to, the saved networks, and joining another. Changing it needs the "view and Wi-Fi" level or more. */
export function Network() {
  const services = useServices();
  const { unit, device, refreshUnit } = useApp();
  const [nets, setNets] = useState<Net[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = (unit?.level ?? 0) >= 2;
  const link = unit?.link;

  const scan = useCallback(async () => {
    if (!link) return;
    setScanning(true);
    setError(null);
    try {
      setNets(tidyNetworks(await link.scan()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The scan failed.");
    } finally {
      setScanning(false);
    }
  }, [link]);

  useEffect(() => {
    void refreshUnit();
    if (canEdit) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => nets?.find((n) => n.s === ssid) ?? null, [nets, ssid]);
  if (!unit || !link) return null;
  const state = unit.state;
  const open = selected?.o === true;
  const passwordProblem = !open && pass.length > 0 && pass.length < 8 ? "A Wi-Fi password has at least 8 characters." : null;
  const canJoin = canEdit && !joining && ssid.length >= 1 && ssid.length <= 32 && !passwordProblem && (open || pass.length >= 8);
  const online = state?.wifi === true;

  async function join() {
    if (!link) return;
    setJoining(true);
    setError(null);
    setResult(null);
    try {
      const r = await link.join(ssid, open ? "" : pass);
      setResult(r);
      if (r.connected) {
        setPass("");
        // the activity log says which network, never the password
        if (device) void services.logActivity(device.equipmentId, "wifi_changed", `The Wi-Fi network "${ssid}" was added and joined`).catch(() => undefined);
        await refreshUnit();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the network.");
    } finally {
      setJoining(false);
    }
  }

  async function forget(name?: string) {
    if (!link) return;
    setError(null);
    try {
      await link.forgetNetworks(name);
      if (device) void services.logActivity(device.equipmentId, "wifi_removed", name ? `The Wi-Fi network "${name}" was removed` : "All saved Wi-Fi networks were removed").catch(() => undefined);
      setResult(null);
      await refreshUnit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not forget the network.");
    }
  }

  return (
    <>
      <PageHead title="Network" sub="The unit needs a Wi-Fi network with internet. Use a 2.4 GHz network; the unit cannot join 5 GHz." />

      <section className="card">
        <h2>Now</h2>
        {online ? (
          <Notice kind="ok">
            Connected to <strong>{state?.ssid}</strong>
            {typeof state?.rssi === "number" ? <> · signal {signalLabel(state.rssi).label.toLowerCase()}</> : null}.
          </Notice>
        ) : (
          <Notice kind="warn">The unit is not connected to Wi-Fi.</Notice>
        )}
        {state?.saved && state.saved.length > 0 ? (
          <>
            <p className="group">Saved networks</p>
            <ul className="list">
              {state.saved.map((n) => (
                <li key={n} className="item" style={{ cursor: "default" }}>
                  <span>{n}</span>
                  {canEdit ? (
                    <button className="btn small link" onClick={() => void forget(n)} disabled={joining}>
                      Forget
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {!canEdit ? (
        <Notice kind="warn">Your access lets you look at the unit but not change its Wi-Fi.</Notice>
      ) : (
        <section className="card">
          <h2>Join a network</h2>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => void scan()} disabled={scanning || joining}>
              {scanning ? <Spinner label="Scanning" /> : "Scan for networks"}
            </button>
          </div>

          {nets && nets.length > 0 ? (
            <ul className="list" aria-label="Networks found">
              {nets.slice(0, 12).map((n) => (
                <li key={n.s}>
                  <button className={`item${n.s === ssid ? " selected" : ""}`} aria-pressed={n.s === ssid} onClick={() => setSsid(n.s)}>
                    <span>
                      {n.s} {n.o ? <span className="badge warn">open</span> : null}
                    </span>
                    <SignalBars rssi={n.r} />
                  </button>
                </li>
              ))}
            </ul>
          ) : nets && !scanning ? (
            <p className="sub" style={{ marginTop: 12 }}>
              No networks found. Move closer to the router and scan again, or type the name below.
            </p>
          ) : null}

          <label className="field" style={{ marginTop: 16 }}>
            <span>Network name</span>
            <input className="input" value={ssid} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setSsid(e.target.value)} />
          </label>
          {open ? (
            <p className="sub">This network is open (no password).</p>
          ) : (
            <label className="field">
              <span>Password</span>
              <div className="pw">
                <input className="input" type={showPass ? "text" : "password"} value={pass} maxLength={63} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setPass(e.target.value)} />
                <button type="button" className="btn" onClick={() => setShowPass((s) => !s)} aria-pressed={showPass}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          )}
          {passwordProblem ? <Notice kind="warn">{passwordProblem}</Notice> : null}
          {error ? <Notice kind="bad">{error}</Notice> : null}
          {result?.connected ? (
            <Notice kind="ok">
              Joined {result.ssid} in {((result.ms ?? 0) / 1000).toFixed(1)} s{typeof result.rssi === "number" ? `, signal ${signalLabel(result.rssi).label.toLowerCase()}` : ""}.
            </Notice>
          ) : result ? (
            <Notice kind="bad">The network was saved but the unit could not join it{result.reason ? `: ${result.reason}` : ""}. Check the password and that the network has internet.</Notice>
          ) : null}
          <div className="actions">
            <button className="btn primary" onClick={join} disabled={!canJoin}>
              {joining ? <Spinner label="Joining (up to 30 s)" /> : "Save and join"}
            </button>
            <span className="grow" />
            {state?.saved && state.saved.length > 1 ? (
              <button className="btn link" onClick={() => void forget()} disabled={joining}>
                Forget all saved networks
              </button>
            ) : null}
          </div>
        </section>
      )}
      {error && !canEdit ? <Notice kind="bad">{error}</Notice> : null}
    </>
  );
}
