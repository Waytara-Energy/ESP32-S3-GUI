import { useEffect, useState } from "react";
import { Group, Page, Row } from "@/components/kit";
import type { IntervalInfo } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

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
    <Page title="Push interval" sub="How often the averaged figures are written to WayTara. A shorter interval gives finer history and uses more data.">
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!info && !error ? (
        <Spinner label="Reading the setting" />
      ) : info ? (
        <>
          <Group title="Averaged figures" note="Every change is written to the activity log with your name.">
            <Row label="Now" hint="Standard is 15 minutes" value={label(info.seconds)} />
            <Row label="Write the averaged figures every">
              <select className="input" style={{ width: "auto", minWidth: 170 }} value={choice ?? info.seconds} onChange={(e) => setChoice(Number(e.target.value))} disabled={busy}>
                {info.allowed.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                    {s === info.default ? " (standard)" : ""}
                  </option>
                ))}
              </select>
            </Row>
            <div className="actions-row">
              <button className="btn primary" onClick={save} disabled={busy || choice === null || choice === info.seconds}>
                {busy ? <Spinner label="Saving" /> : "Save"}
              </button>
            </div>
          </Group>
          {saved ? <Notice kind="ok">{saved}</Notice> : null}
          <Group title="What does not change" note="Go Live is not affected, and the newest values keep reaching the dashboards about every 30 seconds whatever you choose here.">
            <Row label="Latest values to the dashboards" value="About every 30 seconds" />
            <Row label="Go Live" value="Every few seconds while somebody watches" />
          </Group>
        </>
      ) : null}
    </Page>
  );
}
