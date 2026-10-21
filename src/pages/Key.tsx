import { useCallback, useEffect, useState } from "react";
import type { RotationInfo } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

const STATES: Record<string, string> = {
  idle: "The unit's key is in use. No change is under way.",
  sent: "A new key was sent to the unit. Waiting for the unit to confirm it.",
  staged: "The unit has the new key and is switching to it.",
};

/** Changing the key a unit uses to talk to WayTara, without cutting it off: the new key is sent sealed with the old one, the unit confirms, then the old one is cut. */
export function Key() {
  const services = useServices();
  const { device } = useApp();
  const [info, setInfo] = useState<RotationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!device) return;
    try {
      setInfo(await services.rotationStatus(device.equipmentId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the key status.");
    }
  }, [device, services]);

  useEffect(() => {
    void load();
  }, [load]);

  // while a change is under way, look again every few seconds
  useEffect(() => {
    if (!info || info.state === "idle") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [info, load]);

  async function start() {
    if (!device) return;
    setBusy(true);
    setConfirming(false);
    setError(null);
    try {
      setInfo(await services.startRotation(device.equipmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the key change.");
    } finally {
      setBusy(false);
    }
  }

  if (!device) return null;
  return (
    <>
      <PageHead title="Key" sub="Why: a key should be replaced when somebody who knew it has left, or when you suspect it was seen. Who: WayTara staff. What changes: only the unit's key; readings keep flowing." />
      <section className="card">
        {error ? <Notice kind="bad">{error}</Notice> : null}
        {!info && !error ? (
          <Spinner label="Reading the key status" />
        ) : info ? (
          <>
            <p>{STATES[info.state] ?? `Status: ${info.state}`}</p>
            {info.state !== "idle" && info.expires_at ? <p className="sub">If it does not finish by {new Date(info.expires_at).toLocaleTimeString()}, it is cancelled and the old key stays.</p> : null}
            {info.state === "idle" && !info.can_start && info.reason ? <Notice kind="warn">{info.reason}</Notice> : null}
            <div className="actions">
              {confirming ? (
                <>
                  <button className="btn danger" onClick={start} disabled={busy}>
                    {busy ? <Spinner label="Starting" /> : "Yes, change the key"}
                  </button>
                  <button className="btn" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => setConfirming(true)} disabled={!info.can_start || busy}>
                  Change the key
                </button>
              )}
            </div>
            <p className="sub" style={{ marginTop: 12 }}>
              The unit must be online and on current firmware. Nobody sees the new key: it never leaves the server and the unit.
            </p>
          </>
        ) : null}
      </section>
    </>
  );
}
