import { useCallback, useEffect, useState } from "react";
import type { NetState, UplinkMode } from "@/ble/unit-link";
import { Group, Pill, Row, Segmented } from "@/components/kit";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

/** Access point names of the usual SIM providers, as a starting point (the SIM's own papers are the truth). */
const APN_HINTS = [
  { name: "Airtel", apn: "airtelgprs.com" },
  { name: "Jio", apn: "jionet" },
  { name: "Vi", apn: "www" },
  { name: "BSNL", apn: "bsnlnet" },
];

/** SIM signal quality (0 to 31, 99 = unknown) in words. */
export function simSignal(csq: number): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (csq === 99 || csq < 0) return { label: "Unknown", tone: "muted" };
  if (csq >= 20) return { label: "Strong", tone: "ok" };
  if (csq >= 12) return { label: "Good", tone: "ok" };
  if (csq >= 7) return { label: "Weak", tone: "warn" };
  return { label: "Very weak", tone: "bad" };
}

const MODES: { id: UplinkMode; label: string }[] = [
  { id: "wifi", label: "Wi-Fi" },
  { id: "sim", label: "SIM" },
  { id: "auto", label: "Wi-Fi, then SIM" },
];

const MODE_TEXT: Record<UplinkMode, string> = {
  wifi: "The unit goes online only through a saved Wi-Fi network.",
  sim: "The unit goes online only through its SIM card (4G). Use this where there is no Wi-Fi.",
  auto: "The unit uses a saved Wi-Fi network when it can, and its SIM card while none can be joined.",
};

/** How the unit reaches the internet: Wi-Fi, its SIM card, or Wi-Fi first with the SIM as the backup. */
export function InternetSection() {
  const { unit, needsRestart } = useApp();
  const link = unit?.link;
  const canEdit = (unit?.level ?? 0) >= 2;
  const [net, setNet] = useState<NetState | null>(null);
  const [mode, setMode] = useState<UplinkMode>("wifi");
  const [apn, setApn] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!link) return;
    try {
      const n = await link.net();
      setNet(n);
      return n;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the unit.");
    }
  }, [link]);

  useEffect(() => {
    void load().then((n) => {
      if (n) {
        setMode(n.uplink);
        setApn(n.apn);
      }
    });
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!unit || !link) return null;

  const needsApn = mode !== "wifi";
  const apnProblem = needsApn && !/^[A-Za-z0-9._-]{1,39}$/.test(apn) ? "Type the SIM's APN (letters, digits, dots and dashes), for example airtelgprs.com." : null;
  const pinProblem = pin !== "" && !/^\d{4,8}$/.test(pin) ? "A SIM PIN is 4 to 8 digits. Leave it empty when the SIM has none." : null;
  const changed = net ? net.uplink !== mode || net.apn !== apn || pin !== "" : false;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await link!.setUplink(mode, apn.trim(), pin);
      setPin("");
      setSaved(true);
      needsRestart("Internet source");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const sig = net ? simSignal(net.sim_csq) : null;
  return (
    <>
      <Group title="SIM card (4G)" note="How the unit reaches WayTara: through a Wi-Fi network, or through a SIM card in the unit's 4G module.">
        <Row label="Wi-Fi">{net ? net.wifi ? <Pill tone="ok">Connected</Pill> : <Pill tone="muted">Not in use</Pill> : "–"}</Row>
        <Row label="SIM card" hint={net && net.sim_state ? net.sim_state : undefined}>
          {net ? net.sim_up ? <Pill tone="ok">Online</Pill> : net.sim_running ? <Pill tone="warn">Connecting</Pill> : <Pill tone="muted">Not in use</Pill> : "–"}
        </Row>
        {net && (net.sim_up || net.sim_operator) ? (
          <>
            <Row label="Network" value={net.sim_operator || "–"} />
            <Row label="Signal">{sig ? <Pill tone={sig.tone}>{sig.label}</Pill> : "–"}</Row>
            <Row label="SIM card number" mono value={net.sim_card || "–"} />
            {net.sim_up ? <Row label="Address" mono value={net.sim_ip} /> : null}
          </>
        ) : null}
        {net && net.sim_running && !net.sim_up && net.sim_failures > 0 ? (
          <div className="pad sub">
            {net.sim_failures} failed {net.sim_failures === 1 ? "try" : "tries"} so far. Check that the SIM is in, has a data pack, the antenna is on, and the APN is right.
          </div>
        ) : null}
      </Group>

      {!canEdit ? (
        <Notice kind="warn">Your access lets you look at the unit but not change how it goes online.</Notice>
      ) : (
        <Group title="Internet source" note={MODE_TEXT[mode]}>
          <div className="pad">
            <Segmented value={mode} onChange={setMode} options={MODES} />
            {needsApn ? (
              <>
                <label className="field">
                  <span>SIM APN</span>
                  <input className="input" value={apn} maxLength={39} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setApn(e.target.value)} />
                </label>
                <div className="actions" style={{ flexWrap: "wrap" }}>
                  {APN_HINTS.map((h) => (
                    <button key={h.apn} type="button" className="btn small" onClick={() => setApn(h.apn)}>
                      {h.name}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>SIM PIN (only if the SIM has one)</span>
                  <input className="input" type="password" value={pin} maxLength={8} inputMode="numeric" autoComplete="off" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder={net?.apn ? "leave empty to keep the saved PIN" : ""} />
                </label>
              </>
            ) : null}
            {apnProblem ? <Notice kind="warn">{apnProblem}</Notice> : null}
            {pinProblem ? <Notice kind="warn">{pinProblem}</Notice> : null}
            {error ? <Notice kind="bad">{error}</Notice> : null}
            {saved ? <Notice kind="ok">Saved. The unit restarts to use it (use the restart bar below).</Notice> : null}
            <div className="actions">
              <button className="btn primary" onClick={() => void save()} disabled={busy || !changed || !!apnProblem || !!pinProblem}>
                {busy ? <Spinner label="Saving" /> : "Save"}
              </button>
            </div>
          </div>
        </Group>
      )}
    </>
  );
}
