import { useState } from "react";
import { useServices, type UnitSession } from "@/services";
import { Notice, Spinner } from "@/ui";

export type { UnitSession };

export function Connect({ session, equipmentName, onConnected, onNext }: { session: UnitSession | null; equipmentName: string; onConnected: (s: UnitSession) => void; onNext: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const services = useServices();
  const supported = services.bluetoothAvailable();

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const s = await services.connectUnit();
      if (s) onConnected(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h1>Connect to the unit</h1>
      <p className="sub">Setting up for {equipmentName}. Stand next to the unit.</p>
      {!supported ? (
        <Notice kind="bad">
          This browser cannot use Bluetooth. Open this page in Chrome or Edge on an Android phone or a computer (not in Safari or on an iPhone), and make sure the page address starts with https.
        </Notice>
      ) : session ? (
        <>
          <Notice kind="ok">Connected to {session.name} over an encrypted Bluetooth link.</Notice>
          <dl className="kv">
            <dt>Unit</dt>
            <dd>{session.info.hw}</dd>
            <dt>Firmware</dt>
            <dd>{session.info.fw}</dd>
            <dt>Set up before</dt>
            <dd>{session.info.claimed ? "Yes" : "No, this unit is new"}</dd>
          </dl>
          {session.info.claimed ? <Notice kind="warn">This unit already belongs to a device. Finishing setup replaces that: it will report as {equipmentName} from now on.</Notice> : null}
          <div className="actions">
            <button className="btn primary" onClick={onNext}>
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <ol>
            <li>Power the unit.</li>
            <li>
              Hold the <strong>BOOT</strong> button for 3 seconds. A new unit opens its setup window by itself. The window stays open for 10 minutes.
            </li>
            <li>Press the button below and choose the unit named “WayTara-…”.</li>
          </ol>
          {error ? <Notice kind="bad">{error}</Notice> : null}
          <div className="actions">
            <button className="btn primary" onClick={connect} disabled={busy}>
              {busy ? <Spinner label="Connecting" /> : "Find my unit"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
