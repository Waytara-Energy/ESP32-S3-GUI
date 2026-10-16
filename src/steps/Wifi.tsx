import { useCallback, useEffect, useMemo, useState } from "react";
import type { JoinResult, Network, UnitState } from "@/ble/unit-link";
import type { UnitSession } from "./Connect";
import { signalLabel } from "@/lib/messages";
import { Notice, SignalBars, Spinner } from "@/ui";

/** One row per network name, the strongest first. */
export function tidyNetworks(list: Network[]): Network[] {
  const best = new Map<string, Network>();
  for (const n of list) {
    if (!n.s) continue;
    const prev = best.get(n.s);
    if (!prev || n.r > prev.r) best.set(n.s, n);
  }
  return [...best.values()].sort((a, b) => b.r - a.r);
}

export function Wifi({ session, onJoined, onNext }: { session: UnitSession; onJoined: () => void; onNext: () => void }) {
  const { link } = session;
  const [state, setState] = useState<UnitState | null>(null);
  const [nets, setNets] = useState<Network[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await link.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the unit.");
    }
  }, [link]);

  const scan = useCallback(async () => {
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
    void refresh().then(() => scan());
  }, [refresh, scan]);

  const selected = useMemo(() => nets?.find((n) => n.s === ssid) ?? null, [nets, ssid]);
  const open = selected?.o === true;
  const passwordProblem = !open && pass.length > 0 && pass.length < 8 ? "A Wi-Fi password has at least 8 characters." : null;
  const canJoin = !joining && ssid.length >= 1 && ssid.length <= 32 && !passwordProblem && (open || pass.length >= 8);

  async function join() {
    setJoining(true);
    setError(null);
    setResult(null);
    try {
      const r = await link.join(ssid, open ? "" : pass);
      setResult(r);
      if (r.connected) {
        setPass("");
        onJoined();
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the network.");
    } finally {
      setJoining(false);
    }
  }

  async function forget() {
    setError(null);
    try {
      await link.forgetNetworks();
      setResult(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not forget the networks.");
    }
  }

  const online = state?.wifi === true;

  return (
    <section className="card">
      <h1>Wi-Fi</h1>
      <p className="sub">The unit needs a Wi-Fi network with internet. Use a 2.4 GHz network; the unit cannot join 5 GHz.</p>

      {online ? (
        <Notice kind="ok">
          The unit is connected to <strong>{state?.ssid}</strong>
          {typeof state?.rssi === "number" ? <> · signal {signalLabel(state.rssi).label.toLowerCase()}</> : null}. You can continue, or join a different network below.
        </Notice>
      ) : null}

      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn" onClick={scan} disabled={scanning || joining}>
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
        {state?.saved && state.saved.length > 0 ? (
          <button className="btn link" onClick={forget} disabled={joining}>
            Forget saved networks ({state.saved.length})
          </button>
        ) : null}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onNext} disabled={!online || joining}>
          Continue
        </button>
      </div>
    </section>
  );
}
