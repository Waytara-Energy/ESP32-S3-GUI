import { useCallback, useEffect, useState } from "react";
import type { EvInfo } from "@/ble/unit-link";
import { Group, Page, Pill, Row } from "@/components/kit";
import type { ChargerInfo } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

/** The tests of a new charger, in the order a charger goes through them. `hub` is what the WayTara service says about the charger. */
export interface EvTest {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function evTests(ev: EvInfo | null, hubSees: boolean): EvTest[] {
  const connected = ev?.connected === true;
  const introduced = (ev?.boots ?? 0) > 0;
  return [
    { id: "wifi", label: "The charger is on the unit's network", ok: connected },
    { id: "boot", label: "The charger introduced itself", ok: introduced, detail: introduced ? [ev?.vendor, ev?.model].filter(Boolean).join(" ") || undefined : undefined },
    { id: "beat", label: "It checks in regularly (heartbeat or status)", ok: (ev?.heartbeats ?? 0) > 0 || !!ev?.status, detail: ev?.status ? `Status: ${ev.status}` : undefined },
    { id: "meter", label: "It sends meter readings", ok: (ev?.meter_values ?? 0) > 0, detail: (ev?.meter_values ?? 0) === 0 ? "These come while a car is charging, or about every 30 seconds after a start." : undefined },
    { id: "hub", label: "WayTara receives it", ok: hubSees },
  ];
}

/** Adding an EV charger to the unit: the unit opens its own Wi-Fi network for it, the page makes the address to type into the charger, and tests show when it works. */
export function Chargers() {
  const services = useServices();
  const { unit, device } = useApp();
  const link = unit?.link;
  const canEdit = (unit?.level ?? 0) >= 2;
  const [ev, setEv] = useState<EvInfo | null>(null);
  const [list, setList] = useState<ChargerInfo[]>([]);
  const [label, setLabel] = useState("EV charger");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const refresh = useCallback(async () => {
    if (!link) return;
    try {
      setEv(await link.evState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the unit.");
    }
    if (device) {
      try {
        setList(await services.chargers(device.equipmentId));
      } catch {
        /* the page says it when adding fails; the list is only a convenience */
      }
    }
  }, [link, device, services]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!unit || !link) return null;
  const running = ev?.enabled === true;
  const lan = ev?.mode === "lan";
  const mine = list.find((c) => ev?.cp && c.charge_point_id === ev.cp);
  const showWizard = running || adding;

  async function add() {
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      const open = await link!.evOpen();
      try {
        await services.addCharger(device.equipmentId, { charge_point_id: open.cp, label: label.trim() || "EV charger" });
      } catch (e) {
        // a retry after the first attempt got that far: the charger is already added, which is fine
        const had = (await services.chargers(device.equipmentId).catch(() => [])).some((c) => c.charge_point_id === open.cp);
        if (!had) {
          await link!.evClose().catch(() => undefined);
          throw e;
        }
      }
      setAdding(false);
      // the unit opens the network after a restart when its memory is short right now: say so, the page reconnects with it
      setRestarting(open.restart === true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the charger up.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!device || !ev?.cp) return;
    setBusy(true);
    setError(null);
    try {
      await services.removeCharger(device.equipmentId, ev.cp).catch(() => undefined);
      await link!.evClose();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the charger.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      /* the text is on screen to copy by hand */
    }
  }

  const tests = evTests(ev, mine?.connected === true);
  const allOk = tests.every((t) => t.ok);

  return (
    <Page title="EV chargers" sub={lan ? "The charger joins the same Wi-Fi network as the unit. The unit passes its messages to WayTara, so you see the charger's data and can start and stop charging." : "An EV charger connects to the unit's own Wi-Fi network (it does not need your internet). The unit passes its messages to WayTara, so you see the charger's data and can start and stop charging."}>
      {!canEdit ? <Notice kind="warn">Your access lets you look at the unit but not add chargers.</Notice> : null}
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {restarting ? <Notice kind="info">The unit restarts in a moment to open the charger network. Connect to it again in about a minute; the address below stays the same.</Notice> : null}

      {!showWizard ? (
        <Group title="Chargers on this unit">
          <div className="pad sub">No charger has been added to this unit yet.</div>
          {canEdit ? (
            <div className="pad" style={{ borderTop: "1px solid var(--hair)" }}>
              <div className="actions">
                <button className="btn primary" onClick={() => setAdding(true)} disabled={!device}>
                  Add an EV charger
                </button>
              </div>
              {!device ? <p className="sub">Choose the device this unit belongs to first.</p> : null}
            </div>
          ) : null}
        </Group>
      ) : null}

      {adding && !running ? (
        <Group title="Add an EV charger" note="The unit opens a Wi-Fi network for the charger and makes the address to type into it. Nothing else on this site is changed.">
          <div className="pad">
            <label className="field">
              <span>Name of the charger</span>
              <input className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <div className="actions">
              <button className="btn primary" onClick={() => void add()} disabled={busy || !canEdit}>
                {busy ? <Spinner label="Setting up" /> : "Create the connection"}
              </button>
              <button className="btn" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </Group>
      ) : null}

      {running && ev ? (
        <>
          <Group title="1. Connect the charger" note={lan ? "In the charger's own app or web page: join the same Wi-Fi network as the unit (shown below), then set the charger's server address (OCPP / CSMS URL) to the address below. Some chargers ask for the name and the address separately: the name is the last part of the address." : "In the charger's own app or web page: join this Wi-Fi network, then set the charger's server address (OCPP / CSMS URL) to the address below. Some chargers ask for the name and the address separately: the name is the last part of the address."}>
            <Row label={lan ? "Wi-Fi network (the one the unit has joined)" : "Wi-Fi network"} mono value={ev.ssid} />
            {lan ? null : (
              <Row label="Wi-Fi password">
                <span className="mono">{ev.password}</span>{" "}
                <button className="btn small link" onClick={() => void copy("pw", ev.password ?? "")}>
                  {copied === "pw" ? "Copied" : "Copy"}
                </button>
              </Row>
            )}
            {!lan && typeof ev.stations === "number" ? <Row label="Devices on the unit's Wi-Fi" hint="Zero while the charger has not joined the network." value={String(ev.stations)} /> : null}
            <Row label="Server address" hint={lan ? "This is the unit's address on that Wi-Fi right now. It is read from the unit each time you open this page: copy it into the charger. Ask the router to always give the unit the same address (a DHCP reservation), or the charger stops finding it when the address changes." : "Plain ws:// is right here: the network is private to the unit."}>
              <span className="mono" style={{ wordBreak: "break-all" }}>{ev.url}</span>{" "}
              <button className="btn small link" onClick={() => void copy("url", ev.url ?? "")}>
                {copied === "url" ? "Copied" : "Copy"}
              </button>
            </Row>
          </Group>

          <Group title="2. Tests" aside={allOk ? <Pill tone="ok">All passed</Pill> : <Spinner label="Waiting for the charger" />}>
            {tests.map((t) => (
              <Row key={t.id} label={t.label} hint={t.detail}>
                {t.ok ? <Pill tone="ok">Passed</Pill> : <Pill tone="muted">Waiting</Pill>}
              </Row>
            ))}
            {!ev.hub_link ? <div className="pad"><Notice kind="warn">The unit is not connected to WayTara right now. Check Internet.</Notice></div> : null}
          </Group>

          <div className="actions">
            {canEdit ? (
              <button className="btn" onClick={() => void remove()} disabled={busy}>
                {busy ? <Spinner label="Removing" /> : "Remove this charger"}
              </button>
            ) : null}
            <span className="grow" />
            <span className="sub">{allOk ? "Everything works. You can leave this page: the charger stays connected." : "The tests update by themselves every few seconds."}</span>
          </div>
        </>
      ) : null}

      {list.length > 0 ? (
        <Group title="Chargers added">
          {list.map((c) => (
            <Row key={c.equipment_id} label={c.label ?? "EV charger"} hint={`Name in the address: ${c.charge_point_id}`}>
              {c.connected ? <Pill tone="ok">Online</Pill> : <Pill tone="muted">Not connected</Pill>}
            </Row>
          ))}
        </Group>
      ) : null}
    </Page>
  );
}
