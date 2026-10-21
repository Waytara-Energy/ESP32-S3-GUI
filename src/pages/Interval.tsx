import { useEffect, useMemo, useState } from "react";
import { Group, Page, Row } from "@/components/kit";
import type { IntervalInfo, ReadRate, ReadRates } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

const label = (s: number): string => (s < 3600 ? `${s / 60} minute${s === 60 ? "" : "s"}` : "1 hour");
/** A read rate in plain words: "10 seconds", "2 minutes". */
const rateText = (s: number): string => (s < 60 ? `${s} seconds` : s === 60 ? "1 minute" : `${s / 60} minutes`);

/** The choice for one value: a rate in seconds, or "map" for the rate the register map was made with. */
type Pick = number | "map";
const current = (m: ReadRate): Pick => (m.custom ? m.seconds : "map");

/**
 * Two settings of the hub, both logged with the person's name: how often the averaged figures reach the database (the push interval), and how
 * often each value is read from the inverter (the read rate, which is also the rhythm of the cadence data kept in the cloud store).
 */
export function Interval() {
  const services = useServices();
  const { device, needsRestart } = useApp();
  const [info, setInfo] = useState<IntervalInfo | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rates, setRates] = useState<ReadRates | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [ratesBusy, setRatesBusy] = useState(false);
  const [ratesSaved, setRatesSaved] = useState<string | null>(null);

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
    services.getReadRates(device.equipmentId).then(
      (r) => live && setRates(r),
      (e: unknown) => live && setRatesError(e instanceof Error ? e.message : "Could not read the read rates."),
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

  const pickOf = (m: ReadRate): Pick => picks[m.key] ?? current(m);
  // a value is edited when the rate it would be read at differs from the rate in force (choosing the map's own rate by number is no change)
  const edited = useMemo(
    () =>
      rates
        ? rates.metrics.filter((m) => {
            const p = picks[m.key];
            return p !== undefined && (p === "map" ? m.map_s : p) !== m.seconds;
          })
        : [],
    [rates, picks],
  );
  const byCategory = useMemo(() => {
    const out = new Map<string, ReadRate[]>();
    for (const m of rates?.metrics ?? []) out.set(m.category, [...(out.get(m.category) ?? []), m]);
    return [...out.entries()];
  }, [rates]);

  function setAll(p: Pick) {
    if (!rates) return;
    setRatesSaved(null);
    setPicks(Object.fromEntries(rates.metrics.map((m) => [m.key, p])));
  }

  async function saveRates() {
    if (!device || !rates || edited.length === 0) return;
    setRatesBusy(true);
    setRatesError(null);
    setRatesSaved(null);
    try {
      const r = await services.setReadRates(
        device.equipmentId,
        edited.map((m) => ({ key: m.key, seconds: pickOf(m) === "map" ? null : (pickOf(m) as number) })),
      );
      setRates(await services.getReadRates(device.equipmentId));
      setPicks({});
      setRatesSaved(r.changed === 1 ? "The read rate of 1 value was changed." : `The read rates of ${r.changed} values were changed.`);
      if (r.changed > 0) needsRestart("Read rates");
    } catch (e) {
      setRatesError(e instanceof Error ? e.message : "Could not change the read rates.");
    } finally {
      setRatesBusy(false);
    }
  }

  if (!device) return null;
  return (
    <Page title="Push interval" sub="How often the averaged figures are written to WayTara, and how often each value is read from the inverter.">
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

      <Group
        title="Read rate of each value"
        note="How often the unit reads each value from the inverter, and so how finely the cadence data kept in the cloud store follows it. Values that sit in the same block of the inverter are read together, at the fastest rate among them. A very short rate on many values can crowd the RS485 line. Every change is written to the activity log with your name."
        aside={
          rates && rates.metrics.length > 0 ? (
            <select className="input" style={{ width: "auto" }} aria-label="Set every value to" value="" onChange={(e) => e.target.value && setAll(e.target.value === "map" ? "map" : Number(e.target.value))} disabled={ratesBusy}>
              <option value="">Set every value to…</option>
              <option value="map">Use the map&apos;s rate</option>
              {rates.allowed.map((s) => (
                <option key={s} value={s}>
                  {rateText(s)}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {!rates && !ratesError ? <Spinner label="Reading the read rates" /> : null}
        {rates && rates.metrics.length === 0 ? <Row label="No values" hint="This device has no values read from the inverter." /> : null}
      </Group>
      {ratesError ? <Notice kind="bad">{ratesError}</Notice> : null}
      {ratesSaved ? <Notice kind="ok">{ratesSaved} Restart the unit (the bar above) to apply them at once.</Notice> : null}

      {rates
        ? byCategory.map(([category, list]) => (
            <Group key={category} title={category}>
              {list.map((m) => (
                <Row key={m.key} label={m.unit ? `${m.label} (${m.unit})` : m.label} hint={`Map: ${rateText(m.map_s)}${m.custom ? ` · now ${rateText(m.seconds)}` : ""}`}>
                  <select
                    className="input"
                    style={{ width: "auto", minWidth: 190 }}
                    value={String(pickOf(m))}
                    onChange={(e) => {
                      setRatesSaved(null);
                      setPicks((p) => ({ ...p, [m.key]: e.target.value === "map" ? "map" : Number(e.target.value) }));
                    }}
                    disabled={ratesBusy}
                    aria-label={`Read rate of ${m.label}`}
                  >
                    <option value="map">Use the map ({rateText(m.map_s)})</option>
                    {rates.allowed.map((s) => (
                      <option key={s} value={s}>
                        {rateText(s)}
                      </option>
                    ))}
                  </select>
                </Row>
              ))}
            </Group>
          ))
        : null}

      {rates && rates.metrics.length > 0 ? (
        <div className="actions-row">
          <button className="btn primary" onClick={saveRates} disabled={ratesBusy || edited.length === 0}>
            {ratesBusy ? <Spinner label="Saving" /> : edited.length === 0 ? "Save the read rates" : `Save ${edited.length} change${edited.length === 1 ? "" : "s"}`}
          </button>
          {edited.length > 0 ? (
            <button className="btn" onClick={() => setPicks({})} disabled={ratesBusy}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </Page>
  );
}
