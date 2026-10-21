import { Empty, Group, Page, Pill, Row } from "@/components/kit";
import { useApp } from "@/state";
import { Notice } from "@/ui";

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** The unit this page is working with, a way back to the radar, and the units opened before on this browser. */
export function Units() {
  const { unit, offline, disconnect, closeOffline, remembered, forget, openOffline, outcome, linkLost } = useApp();

  return (
    <Page title="Units" sub="The unit you are working with, and the units you opened before on this browser.">
      {linkLost ? <Notice kind="warn">The Bluetooth connection ended. The unit lets go of a phone that is quiet for 5 minutes.</Notice> : null}
      {outcome?.kind === "new_unit" ? <Notice kind="info">{outcome.message}</Notice> : null}

      <Group title="This session">
        <Row label="Bluetooth">{unit ? <Pill tone="ok">Connected to {unit.name}</Pill> : <Pill>{offline ? "Not used (looking without Bluetooth)" : "Not connected"}</Pill>}</Row>
        {unit?.device ? <Row label="Device" value={`${unit.device.label} · ${unit.device.site}`} /> : null}
        <div className="actions-row">
          <button className="btn primary" onClick={() => (unit ? disconnect() : offline ? closeOffline() : disconnect())}>
            {unit ? "Disconnect and scan again" : "Back to the radar"}
          </button>
        </div>
      </Group>

      <Group title="Your units" note="Kept on this browser only: names and hardware IDs, never keys or passwords.">
        {remembered.length === 0 ? (
          <div className="pad">
            <Empty title="No units yet" text="Units you connect to appear here." />
          </div>
        ) : (
          remembered.map((u) => (
            <Row key={u.hw} label={u.label ?? u.name} hint={`${u.site ?? "Not set up"} · ${u.name} · ${ago(u.seenAt)}`}>
              {u.equipmentId && u.label ? (
                <button className="btn small" onClick={() => openOffline({ equipmentId: u.equipmentId!, label: u.label!, site: u.site ?? "" })}>
                  Open without Bluetooth
                </button>
              ) : null}
              <button className="btn small link" onClick={() => forget(u.hw)}>
                Forget
              </button>
            </Row>
          ))
        )}
      </Group>
    </Page>
  );
}
