import { useState } from "react";
import { Group, Page, Pill, Row, Tile, Tiles, yesNo } from "@/components/kit";
import { signalLabel } from "@/lib/messages";
import { levelName, roleName } from "@/lib/roles";
import { uptimeText, useUnitStatus } from "@/lib/use-status";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

const WHAT_LEVEL: Record<number, string> = {
  1: "Look at the unit, its status and its live readings.",
  2: "Look at the unit and change its Wi-Fi.",
  3: "Everything above, plus the register map, live logs, the push interval and the key, and restart the unit.",
  4: "Everything, including setting up a new unit.",
};

/** Everything about the unit and its connections on one page, refreshed every few seconds. */
export function Overview() {
  const { unit, device, email, role, restartUnit } = useApp();
  const { status: s } = useUnitStatus(unit?.link);
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!unit) return null;
  const st = unit.state;
  const wifi = s?.wifi ?? st?.wifi;
  const ssid = s?.ssid ?? st?.ssid;
  const rssi = s?.rssi ?? st?.rssi;
  const hubLink = s?.hub_link ?? st?.hub_link;
  const sig = typeof rssi === "number" ? signalLabel(rssi) : null;

  async function restart() {
    setRestarting(true);
    setError(null);
    try {
      await restartUnit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restart the unit.");
      setRestarting(false);
    }
  }

  return (
    <Page>
      <section className="hero">
        <div>
          <h1>{device ? device.label : unit.name}</h1>
          <p>{device ? `${device.site} · monitoring unit ${unit.name}` : `Monitoring unit ${unit.name}`}</p>
          <div className="pills">
            {hubLink === undefined ? <Pill>Checking</Pill> : hubLink ? <Pill tone="ok">Online with WayTara</Pill> : <Pill tone="bad">Not reaching WayTara</Pill>}
            {s ? s.inverter_online ? <Pill tone="ok">Inverter answering</Pill> : <Pill tone="warn">Inverter not answering</Pill> : null}
            <Pill tone="info">{levelName(unit.level)}</Pill>
          </div>
        </div>
        <div className="fwbox">
          <small>Unit firmware</small>
          <b>{unit.fw}</b>
        </div>
      </section>

      <Tiles>
        <Tile label="Wi-Fi signal" value={typeof rssi === "number" ? rssi : "–"} unit={typeof rssi === "number" ? "dBm" : undefined} sub={sig ? sig.label : "No Wi-Fi"} tone={sig ? (sig.level >= 2 ? "ok" : sig.level === 1 ? "warn" : "bad") : "muted"} meter={typeof rssi === "number" ? Math.max(0, Math.min(1, (rssi + 95) / 50)) : 0} />
        <Tile label="Running for" value={s ? uptimeText(s.uptime_s) : "–"} sub={s ? `Start number ${s.boot}` : undefined} />
        <Tile label="Readings waiting to send" value={s ? s.queue_frames : "–"} sub={s ? `${s.dropped} lost` : undefined} tone={s && s.dropped > 0 ? "warn" : undefined} />
        <Tile label="Inverter reads that worked" value={s ? s.ok_pct_5min : "–"} unit={s ? "%" : undefined} sub="Last 5 minutes" tone={s ? (s.ok_pct_5min >= 90 ? "ok" : s.ok_pct_5min > 0 ? "warn" : "bad") : undefined} meter={s ? s.ok_pct_5min / 100 : 0} />
      </Tiles>

      <Group title="Monitoring unit">
        <Row label="Bluetooth name" value={unit.name} />
        <Row label="Hardware ID" hint="Printed in the unit's records" mono value={unit.hw} />
        <Row label="Firmware" mono value={unit.fw} />
        <Row label="Set up and linked to a device">{yesNo(unit.claimed, "Yes", "Not yet", "warn")}</Row>
        {device ? <Row label="Linked device" value={`${device.label} · ${device.site}`} /> : null}
        {s ? <Row label="Register map" value={`Version ${s.map_ver}: ${s.map_requests} reads, ${s.map_writes} settings`} /> : null}
      </Group>

      <Group title="Connection">
        <Row label="Wi-Fi">{wifi === undefined ? <Pill>Checking</Pill> : wifi ? <span>{ssid}</span> : <Pill tone="bad">Not connected</Pill>}</Row>
        {wifi && s ? <Row label="Channel and address" mono value={`channel ${s.channel} · ${s.ip}`} /> : null}
        <Row label="WayTara server" mono value={s?.hub ?? st?.hub} />
        <Row label="Link to the server">{hubLink === undefined ? <Pill>Checking</Pill> : yesNo(hubLink, "Connected", "Not connected")}</Row>
        <Row label="Clock" hint="Needed to time every reading">{yesNo(s?.clock ?? st?.clock, "Set", "Not set")}</Row>
      </Group>

      <Group title="Inverter" note={s?.simulated ? "This unit is sending made-up test readings, not the inverter's." : "The unit reads the inverter over RS485 (Modbus) according to the register map."}>
        <Row label="Answering">{yesNo(s?.inverter_online, "Yes", "No", "warn")}</Row>
        <Row label="Last good read" value={s ? (s.inverter_online ? `${s.last_ok_age_s} s ago` : "None in the last 30 seconds") : "–"} />
        <Row label="Reads this start" value={s ? `${s.rounds} rounds, ${s.requests_failed} failed requests` : "–"} />
        {s && s.dead_registers > 0 ? <Row label="Registers skipped" hint="The inverter does not answer these" value={String(s.dead_registers)} /> : null}
      </Group>

      <Group title="Your access" note={WHAT_LEVEL[unit.level]}>
        <Row label="Signed in as" value={email} />
        <Row label="Account type" value={roleName(role)} />
        <Row label="Access to this unit">
          <Pill tone="info">{levelName(unit.level)}</Pill>
        </Row>
      </Group>

      {unit.level >= 3 ? (
        <Group title="Restart" note="The unit restarts in a few seconds and joins WayTara again. Readings it has not sent yet are lost, so do this only when needed.">
          <div className="pad">
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
                  Restart the unit
                </button>
              )}
            </div>
          </div>
        </Group>
      ) : null}
    </Page>
  );
}
