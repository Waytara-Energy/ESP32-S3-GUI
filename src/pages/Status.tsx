import { useEffect, useState } from "react";
import type { UnitStatus } from "@/ble/unit-link";
import { signalLabel } from "@/lib/messages";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner, YesNo } from "@/ui";

const dur = (s: number): string => {
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172_800) return `${(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86_400)} days`;
};

/** The unit's own account of itself, refreshed every few seconds while the page is open. */
export function Status() {
  const { unit } = useApp();
  const [s, setS] = useState<UnitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unit) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const v = await unit.link.status();
        if (live) {
          setS(v);
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not read the status.");
      }
      if (live) timer = setTimeout(() => void tick(), 5000);
    };
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [unit]);

  if (!unit) return null;
  return (
    <>
      <PageHead title="Status" sub="What the unit reports about itself. It refreshes every few seconds." />
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!s ? (
        <Spinner label="Reading the unit" />
      ) : (
        <>
          <div className="grid">
            <section className="card">
              <h2>Wi-Fi</h2>
              <dl className="kv">
                <dt>Connected</dt>
                <dd>
                  <YesNo yes={s.wifi} />
                </dd>
                {s.wifi ? (
                  <>
                    <dt>Network</dt>
                    <dd>{s.ssid}</dd>
                    <dt>Signal</dt>
                    <dd>
                      {typeof s.rssi === "number" ? `${signalLabel(s.rssi).label} (${s.rssi} dBm), channel ${s.channel}` : "–"}
                    </dd>
                    <dt>Address</dt>
                    <dd className="mono">{s.ip}</dd>
                  </>
                ) : null}
                <dt>Clock</dt>
                <dd>
                  <YesNo yes={s.clock} yesText="Set" noText="Not set" />
                </dd>
              </dl>
            </section>
            <section className="card">
              <h2>WayTara server</h2>
              <dl className="kv">
                <dt>Link</dt>
                <dd>
                  <YesNo yes={s.hub_link} yesText="Connected" noText="Not connected" />
                </dd>
                <dt>Server</dt>
                <dd className="mono">{s.hub}</dd>
                <dt>Waiting to send</dt>
                <dd>
                  {s.queue_frames} readings ({Math.round(s.queue_bytes / 1024)} KB)
                </dd>
                <dt>Sent / confirmed</dt>
                <dd>
                  #{s.seq_sent} / #{s.seq_acked}
                </dd>
                {s.dropped > 0 ? (
                  <>
                    <dt>Lost</dt>
                    <dd>
                      <span className="badge bad">{s.dropped} readings dropped</span>
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>
            <section className="card">
              <h2>Inverter</h2>
              <dl className="kv">
                <dt>Answering</dt>
                <dd>
                  <YesNo yes={s.inverter_online} />
                </dd>
                <dt>Last good read</dt>
                <dd>{s.inverter_online ? `${s.last_ok_age_s} s ago` : "–"}</dd>
                <dt>Success rate</dt>
                <dd>{s.ok_pct_5min}% over 5 minutes</dd>
                <dt>Reads / failures</dt>
                <dd>
                  {s.rounds} / {s.requests_failed}
                </dd>
                {s.dead_registers > 0 ? (
                  <>
                    <dt>Skipped</dt>
                    <dd>{s.dead_registers} registers the inverter does not answer</dd>
                  </>
                ) : null}
                {s.simulated ? (
                  <>
                    <dt>Mode</dt>
                    <dd>
                      <span className="badge warn">Test inverter</span>
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>
            <section className="card">
              <h2>Unit</h2>
              <dl className="kv">
                <dt>Running for</dt>
                <dd>{dur(s.uptime_s)}</dd>
                <dt>Start number</dt>
                <dd>{s.boot}</dd>
                <dt>Register map</dt>
                <dd>
                  version {s.map_ver}: {s.map_requests} reads, {s.map_writes} settings
                </dd>
                <dt>Free memory</dt>
                <dd>{Math.round(s.heap_free / 1024)} KB</dd>
              </dl>
            </section>
          </div>
        </>
      )}
    </>
  );
}
