import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveBlocks } from "@/ble/unit-link";
import type { DecodedValue } from "@/lib/gateway-api";
import { addBlock, toBlocks } from "@/lib/live-words";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

const fmt = (v: number | string): string => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v);

/**
 * The unit's readings as they are read from the inverter, a few seconds apart. The unit sends raw registers over Bluetooth (it never converts);
 * the WayTara server turns them into values, with the same rules as the stored readings, and a customer gets only what the customer view shows.
 */
export function Live() {
  const services = useServices();
  const { unit, device } = useApp();
  const [values, setValues] = useState<Map<string, DecodedValue>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const words = useRef(new Map<number, string>());
  const round = useRef<{ id: number; blocks: [number, string][] } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!unit || !device) return;
    const { link } = unit;
    let live = true;

    const decode = async () => {
      if (busy.current || pausedRef.current || words.current.size === 0) return;
      busy.current = true;
      try {
        // every register seen so far, joined into blocks; the server decodes them
        const out = await services.decode(device.equipmentId, toBlocks(words.current));
        if (live) {
          setValues((prev) => {
            const next = new Map(prev);
            for (const v of out) next.set(v.key, v);
            return next;
          });
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not read the values.");
      } finally {
        busy.current = false;
      }
    };

    link.onLive = (p: LiveBlocks) => {
      if (pausedRef.current) return;
      if (!round.current || round.current.id !== p.round) round.current = { id: p.round, blocks: [] };
      round.current.blocks.push(...p.blocks);
      if (!p.more) {
        for (const [start, hex] of round.current.blocks) addBlock(words.current, start, hex);
        round.current = null;
        setRounds((n) => n + 1);
        void decode();
      }
    };
    link.live(true).catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Could not start the live readings."));
    return () => {
      live = false;
      link.onLive = null;
      void link.live(false).catch(() => undefined);
    };
  }, [unit, device, services]);

  const grouped = useMemo(() => {
    const g = new Map<string, DecodedValue[]>();
    for (const v of [...values.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      const k = v.group ?? "Other";
      g.set(k, [...(g.get(k) ?? []), v]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [values]);

  if (!unit) return null;
  if (!device) return <Notice kind="warn">This unit is not linked to a device you can see, so its readings cannot be shown.</Notice>;

  return (
    <>
      <PageHead title="Live readings" sub="Read from the inverter by the unit, a few seconds apart, and shown here by the WayTara server." />
      <div className="toolbar">
        <button className="btn small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Resume" : "Pause"}
        </button>
        <span className="sub">{rounds === 0 ? <Spinner label="Waiting for the first reading" /> : `${rounds} updates`}</span>
      </div>
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {grouped.length > 0 ? (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Value</th>
                <th className="num">Reading</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([g, list]) => (
                <GroupRows key={g} name={g} list={list} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function GroupRows({ name, list }: { name: string; list: DecodedValue[] }) {
  return (
    <>
      <tr className="grp">
        <td colSpan={2}>{name}</td>
      </tr>
      {list.map((v) => (
        <tr key={v.key}>
          <td>{v.label}</td>
          <td className="num">
            {fmt(v.value)} {v.unit ?? ""} {v.in_range ? null : <span className="badge warn">out of range</span>}
          </td>
        </tr>
      ))}
    </>
  );
}
