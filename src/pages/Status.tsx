import { useEffect, useState } from "react";
import { Group, Page, Pill, Row, Tile, Tiles, yesNo } from "@/components/kit";
import { signalLabel } from "@/lib/messages";
import { agoText, kb, uptimeText, useUnitStatus } from "@/lib/use-status";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

/** The unit's own account of itself, in full. Refreshes every few seconds while the page is open. */
export function Status() {
  const { unit } = useApp();
  const { status: s, error, at, refresh } = useUnitStatus(unit?.link);
  const [, force] = useState(0);
  // keeps "3 s ago" moving between refreshes
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!unit) return null;

  const sig = s && typeof s.rssi === "number" ? signalLabel(s.rssi) : null;
  const heapTone = s ? (s.heap_free > 40_000 ? "ok" : s.heap_free > 20_000 ? "warn" : "bad") : undefined;

  return (
    <Page
      title="Status"
      sub="What the unit reports about itself."
      actions={
        <>
          <span className="sub" style={{ fontSize: 13 }}>
            {at ? `Updated ${agoText(at)}` : "Reading…"}
          </span>
          <button className="btn small" onClick={refresh}>
            Refresh
          </button>
        </>
      }
    >
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!s ? (
        <Spinner label="Reading the unit" />
      ) : (
        <>
          <Tiles>
            <Tile label="WayTara server" value={s.hub_link ? "Online" : "Offline"} tone={s.hub_link ? "ok" : "bad"} sub={s.hub} />
            <Tile label="Wi-Fi" value={s.wifi ? s.ssid ?? "Connected" : "Not connected"} tone={s.wifi ? "ok" : "bad"} sub={sig ? `${sig.label} (${s.rssi} dBm)` : undefined} />
            <Tile label="Inverter" value={s.inverter_online ? "Answering" : "Silent"} tone={s.inverter_online ? "ok" : "warn"} sub={s.inverter_online ? `Last read ${s.last_ok_age_s} s ago` : "No answer in 30 s"} />
            <Tile label="Running for" value={uptimeText(s.uptime_s)} sub={`Start number ${s.boot}`} />
          </Tiles>

          <Group title="Wi-Fi">
            <Row label="Connected">{yesNo(s.wifi)}</Row>
            {s.wifi ? (
              <>
                <Row label="Network" value={s.ssid} />
                <Row label="Signal" value={sig && typeof s.rssi === "number" ? `${sig.label} (${s.rssi} dBm)` : "–"} />
                <Row label="Channel" value={String(s.channel)} />
                <Row label="Address" mono value={s.ip} />
              </>
            ) : null}
            <Row label="Clock" hint="Set from the internet; every reading is timed with it">{yesNo(s.clock, "Set", "Not set")}</Row>
          </Group>

          <Group title="WayTara server" note="Readings stay in the unit until the server confirms it stored them, so a short outage loses nothing.">
            <Row label="Link">{yesNo(s.hub_link, "Connected", "Not connected")}</Row>
            <Row label="Server" mono value={s.hub} />
            <Row label="Waiting to send" value={`${s.queue_frames} readings (${kb(s.queue_bytes)})`} />
            <Row label="Sent / confirmed" hint="The newest reading number sent, and the newest the server confirmed" mono value={`#${s.seq_sent} / #${s.seq_acked}`} />
            <Row label="Lost">{s.dropped > 0 ? <Pill tone="bad">{s.dropped} readings dropped</Pill> : <Pill tone="ok">None</Pill>}</Row>
          </Group>

          <Group title="Inverter">
            <Row label="Answering">{yesNo(s.inverter_online, "Yes", "No", "warn")}</Row>
            <Row label="Last good read" value={s.inverter_online ? `${s.last_ok_age_s} s ago` : "None in the last 30 seconds"} />
            <Row label="Success rate" hint="Requests answered, last 5 minutes" value={`${s.ok_pct_5min}%`} />
            <Row label="Rounds of reads" value={String(s.rounds)} />
            <Row label="Failed requests" value={String(s.requests_failed)} />
            {s.dead_registers > 0 ? <Row label="Registers skipped" hint="The inverter does not answer these" value={String(s.dead_registers)} /> : null}
            {s.simulated ? (
              <Row label="Mode">
                <Pill tone="warn">Test inverter</Pill>
              </Row>
            ) : null}
          </Group>

          <Group title="Unit" note="The unit keeps Bluetooth, Wi-Fi and the secure connection to WayTara in a small fast memory. If the lowest value ever recorded gets very low, tell WayTara.">
            <Row label="Register map" value={`Version ${s.map_ver}: ${s.map_requests} reads, ${s.map_writes} settings`} />
            <Row label="Free working memory">
              <span>{kb(s.heap_free)}</span>
              <Pill tone={heapTone}>{heapTone === "ok" ? "Healthy" : heapTone === "warn" ? "Getting low" : "Low"}</Pill>
            </Row>
            {s.heap_largest !== undefined ? <Row label="Largest free block" hint="What a new secure connection needs in one piece" value={kb(s.heap_largest)} /> : null}
            {s.heap_min !== undefined ? <Row label="Lowest free memory since start" value={kb(s.heap_min)} /> : null}
            {s.psram_free !== undefined ? <Row label="Free buffer memory" hint="Where readings wait" value={kb(s.psram_free)} /> : null}
          </Group>
        </>
      )}
    </Page>
  );
}
