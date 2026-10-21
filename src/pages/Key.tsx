import { useCallback, useEffect, useState } from "react";
import { Group, Page, Pill, Row } from "@/components/kit";
import type { RotationInfo } from "@/lib/gateway-api";
import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, Spinner } from "@/ui";

const STATES: Record<string, { text: string; tone: "ok" | "warn" | "info" }> = {
  idle: { text: "In use, no change under way", tone: "ok" },
  sent: { text: "New key sent, waiting for the unit", tone: "warn" },
  staged: { text: "The unit is switching to the new key", tone: "warn" },
};

/** Changing the key a unit uses to talk to WayTara, without cutting it off: the new key is sent sealed with the old one, the unit confirms, then the old one is cut. */
export function Key() {
  const services = useServices();
  const { device } = useApp();
  const [info, setInfo] = useState<RotationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!device) return;
    try {
      setInfo(await services.rotationStatus(device.equipmentId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the key status.");
    }
  }, [device, services]);

  useEffect(() => {
    void load();
  }, [load]);

  // while a change is under way, look again every few seconds
  useEffect(() => {
    if (!info || info.state === "idle") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [info, load]);

  async function start() {
    if (!device) return;
    setBusy(true);
    setConfirming(false);
    setError(null);
    try {
      setInfo(await services.startRotation(device.equipmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the key change.");
    } finally {
      setBusy(false);
    }
  }

  if (!device) return null;
  const st = info ? (STATES[info.state] ?? { text: info.state, tone: "info" as const }) : null;
  return (
    <Page title="Key" sub="The secret the unit and WayTara share. Replace it when somebody who knew it has left, or when you suspect it was seen. Readings keep flowing during the change.">
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!info && !error ? (
        <Spinner label="Reading the key status" />
      ) : info && st ? (
        <>
          <Group title="Status" note="Nobody sees the new key: it is made on the server, sent to the unit sealed with the old key, and never shown. If the change does not finish in time it is cancelled and the old key stays.">
            <Row label="Key">
              <Pill tone={st.tone}>{st.text}</Pill>
            </Row>
            {info.state !== "idle" && info.started_at ? <Row label="Started" value={new Date(info.started_at).toLocaleTimeString()} /> : null}
            {info.state !== "idle" && info.expires_at ? <Row label="Cancelled automatically at" value={new Date(info.expires_at).toLocaleTimeString()} /> : null}
            {info.state === "idle" && !info.can_start && info.reason ? <Row label="Cannot be changed now" value={info.reason} /> : null}
          </Group>
          <Group title="Change the key" note="The unit must be online and on current firmware.">
            <div className="pad">
              <div className="actions" style={{ marginTop: 0 }}>
                {confirming ? (
                  <>
                    <button className="btn danger" onClick={start} disabled={busy}>
                      {busy ? <Spinner label="Starting" /> : "Yes, change the key"}
                    </button>
                    <button className="btn" onClick={() => setConfirming(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setConfirming(true)} disabled={!info.can_start || busy}>
                    Change the key
                  </button>
                )}
              </div>
            </div>
          </Group>
        </>
      ) : null}
    </Page>
  );
}
