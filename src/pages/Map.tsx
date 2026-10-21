import { useEffect, useState } from "react";
import { useServices, type MetricInfo } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

interface MapData {
  ver: number;
  reads: number[][];
  writes: number[][];
}

const range = (start: number, count: number): string => (count === 1 ? String(start) : `${start}–${start + count - 1}`);
const every = (s: number): string => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

/** The register map the hub gave the unit: which registers it reads from the inverter and how often, and which settings it may change. */
export function RegisterMap() {
  const services = useServices();
  const { unit, device } = useApp();
  const [data, setData] = useState<MapData | null>(null);
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unit) return;
    let live = true;
    (async () => {
      try {
        const [r, w] = [await unit.link.fullMap("r"), await unit.link.fullMap("w")];
        if (live) setData({ ver: r.ver, reads: r.items, writes: w.items });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not read the register map.");
      }
    })();
    if (device) void services.metrics(device.equipmentId).then((m) => live && setMetrics(m));
    return () => {
      live = false;
    };
  }, [unit, device, services]);

  // the names of the values inside a block of registers
  const namesIn = (start: number, count: number): string =>
    metrics
      .filter((m) => m.direction === "read" && m.registers.length > 0 && m.registers.every((r) => r >= start && r < start + count))
      .map((m) => m.key)
      .join(", ");
  const nameOfWrite = (reg: number): string => metrics.filter((m) => m.direction === "write" && m.registers.includes(reg)).map((m) => m.key).join(", ");

  if (!unit) return null;
  return (
    <>
      <PageHead title="Register map" sub="What the unit reads from the inverter and which settings it is allowed to change. The unit only moves raw numbers; WayTara decodes them." />
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!data && !error ? <Spinner label="Reading the map from the unit" /> : null}
      {data ? (
        <>
          <p className="sub">
            Map version {data.ver}: {data.reads.length} reads, {data.writes.length} settings.
          </p>
          <h2>Reads</h2>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="t">
              <thead>
                <tr>
                  <th>Registers</th>
                  <th className="num">Count</th>
                  <th className="num">Every</th>
                  <th>Values</th>
                </tr>
              </thead>
              <tbody>
                {data.reads.map(([start, count, s]) => (
                  <tr key={`${start}-${count}`}>
                    <td className="mono">{range(start!, count!)}</td>
                    <td className="num">{count}</td>
                    <td className="num">{every(s!)}</td>
                    <td className="sub">{namesIn(start!, count!) || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Settings the unit may change</h2>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Register</th>
                  <th>Bits</th>
                  <th className="num">Lowest</th>
                  <th className="num">Highest</th>
                  <th>Setting</th>
                </tr>
              </thead>
              <tbody>
                {data.writes.map(([reg, mask, lo, hi]) => (
                  <tr key={`${reg}-${mask}`}>
                    <td className="mono">{reg}</td>
                    <td className="mono">{mask === 0xffff ? "all" : `0x${mask!.toString(16)}`}</td>
                    <td className="num">{lo === -1 ? "–" : lo}</td>
                    <td className="num">{hi === -1 ? "–" : hi}</td>
                    <td className="sub">{nameOfWrite(reg!) || "–"}</td>
                  </tr>
                ))}
                {data.writes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="sub">
                      The unit may not change any setting.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
