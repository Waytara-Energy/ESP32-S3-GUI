import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveBlocks } from "@/ble/unit-link";
import { Empty, Group, Page, Pill, Row } from "@/components/kit";
import type { DecodedValue } from "@/lib/gateway-api";
import { addBlock, toBlocks } from "@/lib/live-words";
import { agoText, useUnitStatus } from "@/lib/use-status";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

const fmt = (v: number | string): string => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })) : v);

/**
 * The unit's readings as they are read from the inverter, a few seconds apart. The unit sends raw registers over Bluetooth (it never converts);
 * the WayTara server turns them into values, with the same rules as the stored readings, and a customer gets only what the customer view shows.
 */
export function Live() {
  const services = useServices();
  const { unit, device } = useApp();
  const { status } = useUnitStatus(unit?.link, 6000);
  const [values, setValues] = useState<Map<string, DecodedValue>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const words = useRef(new Map<number, string>());
  const round = useRef<{ id: number; blocks: [number, string][] } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

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
          setLastAt(Date.now());
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
  const silent = status && !status.inverter_online;

  return (
    <Page
      title="Live readings"
      sub="What the unit reads from the inverter, a few seconds apart, decoded by the WayTara server."
      actions={
        <>
          <span className="sub" style={{ fontSize: 13 }}>
            {rounds > 0 ? `${rounds} updates · last ${agoText(lastAt)}` : ""}
          </span>
          <button className="btn small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Resume" : "Pause"}
          </button>
        </>
      }
    >
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {silent ? (
        <Notice kind="warn">The unit is not getting answers from the inverter right now (check the RS485 cable and that the inverter is on), so there is nothing to show yet.</Notice>
      ) : null}
      {grouped.length === 0 ? (
        silent ? null : (
          <Empty title="Waiting for the first reading" text={<Spinner label="Listening to the unit" />} />
        )
      ) : (
        grouped.map(([g, list]) => (
          <Group key={g} title={g}>
            {list.map((v) => (
              <Row key={v.key} label={v.label}>
                <strong style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{fmt(v.value)}</strong>
                {v.unit ? <span className="sub">{v.unit}</span> : null}
                {v.in_range ? null : <Pill tone="warn">Out of range</Pill>}
              </Row>
            ))}
          </Group>
        ))
      )}
    </Page>
  );
}
