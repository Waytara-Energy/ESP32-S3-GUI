import { useState, type FormEvent } from "react";
import { Group, Page, Row } from "@/components/kit";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

/** The device's name, as the dashboard and every list show it. Whoever can see the site may change it (the database decides); each change is logged. */
export function DeviceName() {
  const services = useServices();
  const { device, unit, renamed } = useApp();
  const [name, setName] = useState(device?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!device) return null;

  const tidy = name.replace(/\s+/g, " ").trim();
  const changed = tidy !== device.label;
  const valid = tidy.length >= 1 && tidy.length <= 60;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!device || !valid || !changed) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const stored = await services.renameDevice(device.equipmentId, tidy);
      renamed(stored);
      setName(stored);
      setSaved(`The device is now called "${stored}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Device name" sub="The name shown on the dashboard, in lists and in the activity log.">
      <form onSubmit={save}>
        <Group title="Name" note="Up to 60 characters. Every change is written to the activity log with your name.">
          <div className="pad">
            <label className="field" style={{ maxWidth: 440, marginBottom: 0 }}>
              <span>Device name</span>
              <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="off" />
            </label>
            {!valid && name.length > 0 ? <Notice kind="warn">The name must be 1 to 60 characters.</Notice> : null}
            {saved ? <Notice kind="ok">{saved}</Notice> : null}
            {error ? <Notice kind="bad">{error}</Notice> : null}
          </div>
          <div className="actions-row">
            <button className="btn primary" type="submit" disabled={busy || !valid || !changed}>
              {busy ? <Spinner label="Saving" /> : "Save name"}
            </button>
          </div>
        </Group>
      </form>

      <Group title="About this device" note="The site's name and address and the device's model are kept by WayTara. Ask your WayTara contact to change them.">
        <Row label="Site" value={device.site || "–"} />
        {unit ? (
          <>
            <Row label="Monitoring unit" value={unit.name} />
            <Row label="Hardware ID" mono value={unit.hw} />
            <Row label="Unit firmware" mono value={unit.fw} />
          </>
        ) : (
          <Row label="Monitoring unit" value="Not connected over Bluetooth" />
        )}
      </Group>
    </Page>
  );
}
