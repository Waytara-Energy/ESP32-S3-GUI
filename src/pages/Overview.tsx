import { useState } from "react";
import { levelName } from "@/lib/roles";
import { signalLabel } from "@/lib/messages";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner, YesNo } from "@/ui";

export function Overview() {
  const services = useServices();
  const { unit, device, disconnect } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!unit) return null;
  const s = unit.state;

  async function restart() {
    if (!unit) return;
    setRestarting(true);
    setError(null);
    try {
      await unit.link.reboot();
      if (device) void services.logActivity(device.equipmentId, "unit_restarted", "The unit was restarted from the setup page").catch(() => undefined);
      disconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restart the unit.");
      setRestarting(false);
    }
  }

  return (
    <>
      <PageHead title={device ? device.label : unit.name} sub={device ? `${device.site} · monitoring unit ${unit.name}` : `Monitoring unit ${unit.name}`} />
      <div className="grid">
        <section className="card">
          <h2>Unit</h2>
          <dl className="kv">
            <dt>Hardware id</dt>
            <dd className="mono">{unit.hw}</dd>
            <dt>Firmware</dt>
            <dd>{unit.fw}</dd>
            <dt>Set up</dt>
            <dd>
              <YesNo yes={unit.claimed} noText="Not yet" />
            </dd>
            <dt>Your access</dt>
            <dd>{levelName(unit.level)}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Connection</h2>
          <dl className="kv">
            <dt>Wi-Fi</dt>
            <dd>
              {s?.wifi ? (
                <>
                  {s.ssid} {typeof s.rssi === "number" ? <span className="sub">· {signalLabel(s.rssi).label.toLowerCase()}</span> : null}
                </>
              ) : (
                <YesNo yes={false} noText="Not connected" />
              )}
            </dd>
            <dt>WayTara server</dt>
            <dd>{s?.hub_link === undefined ? "–" : <YesNo yes={s.hub_link} yesText="Connected" noText="Not connected" />}</dd>
            <dt>Clock</dt>
            <dd>{s?.clock === undefined ? "–" : <YesNo yes={s.clock} yesText="Set" noText="Not set" />}</dd>
          </dl>
        </section>
      </div>

      {unit.level >= 3 ? (
        <section className="card">
          <h2>Restart the unit</h2>
          <p className="sub">The unit restarts in a few seconds and joins WayTara again. Readings it has not sent yet are lost, so do this only when needed.</p>
          {error ? <Notice kind="bad">{error}</Notice> : null}
          <div className="actions" style={{ marginTop: 0 }}>
            {confirming ? (
              <>
                <button className="btn danger" onClick={restart} disabled={restarting}>
                  {restarting ? <Spinner label="Restarting" /> : "Yes, restart now"}
                </button>
                <button className="btn" onClick={() => setConfirming(false)} disabled={restarting}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => setConfirming(true)}>
                Restart
              </button>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
