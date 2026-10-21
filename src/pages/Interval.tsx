import { useEffect, useState } from "react";
import type { IntervalInfo } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

const label = (s: number): string => (s < 3600 ? `${s / 60} minute${s === 60 ? "" : "s"}` : "1 hour");

/** How often the unit's averaged figures reach the database (the latest values still arrive every 30 seconds). A setting of the hub; every change is logged. */
export function Interval() {
  const services = useServices();
  const { device } = useApp();
  const [info, setInfo] = useState<IntervalInfo | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) return;
    let live = true;
    services.getInterval(device.equipmentId).then(
      (i) => {
        if (!live) return;
        setInfo(i);
        setChoice(i.seconds);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not read the push interval."),
    );
    return () => {
      live = false;
    };
  }, [device, services]);

  async function save() {
    if (!device || choice === null) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await services.setInterval(device.equipmentId, choice);
      setInfo((cur) => ({ ...(cur ?? { allowed: r.allowed }), seconds: r.seconds, allowed: r.allowed }));
      setSaved(`The push interval is now ${label(r.seconds)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the push interval.");
    } finally {
      setBusy(false);
    }
  }

  if (!device) return null;
  return (
    <>
      <PageHead title="Push interval" sub="How often the averaged figures are written to WayTara. A shorter interval gives finer history and uses more of the unit's mobile data or Wi-Fi." />
      <section className="card">
        {error ? <Notice kind="bad">{error}</Notice> : null}
        {!info && !error ? (
          <Spinner label="Reading the setting" />
        ) : info ? (
          <>
            <label className="field" style={{ maxWidth: 320 }}>
              <span>Write the averaged figures every</span>
              <select className="input" value={choice ?? info.seconds} onChange={(e) => setChoice(Number(e.target.value))} disabled={busy}>
                {info.allowed.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                    {s === info.default ? " (standard)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="sub">The newest values still reach the dashboards about every 30 seconds, and Go Live is not affected.</p>
            {saved ? <Notice kind="ok">{saved}</Notice> : null}
            <div className="actions">
              <button className="btn primary" onClick={save} disabled={busy || choice === null || choice === info.seconds}>
                {busy ? <Spinner label="Saving" /> : "Save"}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
