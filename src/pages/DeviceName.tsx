import { useState, type FormEvent } from "react";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

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
    <>
      <PageHead title="Device name" sub="The name shown on the dashboard, in lists and in the activity log." />
      <form className="card" onSubmit={save}>
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Name</span>
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="off" />
        </label>
        {!valid && name.length > 0 ? <Notice kind="warn">The name must be 1 to 60 characters.</Notice> : null}
        {saved ? <Notice kind="ok">{saved}</Notice> : null}
        {error ? <Notice kind="bad">{error}</Notice> : null}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={busy || !valid || !changed}>
            {busy ? <Spinner label="Saving" /> : "Save name"}
          </button>
        </div>
      </form>

      <section className="card">
        <h2>About this device</h2>
        <dl className="kv">
          <dt>Site</dt>
          <dd>{device.site || "–"}</dd>
          {unit ? (
            <>
              <dt>Monitoring unit</dt>
              <dd>
                {unit.name} <span className="sub">· hardware id</span> <span className="mono">{unit.hw}</span>
              </dd>
              <dt>Unit firmware</dt>
              <dd>{unit.fw}</dd>
            </>
          ) : null}
        </dl>
        <p className="sub" style={{ marginTop: 12 }}>
          The site's name, address and the device's model are kept by WayTara. Ask your WayTara contact to change them.
        </p>
      </section>
    </>
  );
}
