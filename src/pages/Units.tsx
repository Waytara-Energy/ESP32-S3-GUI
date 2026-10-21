import { useApp } from "@/state";
import { Notice, PageHead } from "@/ui";

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
    <>
      <PageHead title="Units" sub="The unit you are working with, and the units you opened before on this browser." />

      <section className="card">
        <h2>{unit ? `Connected to ${unit.name}` : "Not connected over Bluetooth"}</h2>
        {unit ? (
          <p className="sub">
            {unit.device ? `${unit.device.label} · ${unit.device.site}. ` : ""}
            Disconnecting takes you back to the radar, where you can pick another unit.
          </p>
        ) : (
          <p className="sub">You are looking at a device without a Bluetooth connection. Go back to the radar to connect to a unit.</p>
        )}
        {linkLost ? <Notice kind="warn">The Bluetooth connection ended. The unit lets go of a phone that is quiet for 5 minutes.</Notice> : null}
        {outcome?.kind === "new_unit" ? <Notice kind="info">{outcome.message}</Notice> : null}
        <div className="actions">
          <button className="btn primary" onClick={() => (unit ? disconnect() : offline ? closeOffline() : disconnect())}>
            {unit ? "Disconnect and scan again" : "Back to the radar"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Your units</h2>
        {remembered.length === 0 ? (
          <p className="sub">Units you open appear here.</p>
        ) : (
          <ul className="list">
            {remembered.map((u) => (
              <li key={u.hw} className="item" style={{ cursor: "default" }}>
                <span>
                  <strong>{u.label ?? u.name}</strong>
                  <span className="meta">
                    {" "}
                    · {u.site ?? "not set up"} · {u.name} · {ago(u.seenAt)}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {u.equipmentId && u.label ? (
                    <button className="btn small" onClick={() => openOffline({ equipmentId: u.equipmentId!, label: u.label!, site: u.site ?? "" })}>
                      Open without Bluetooth
                    </button>
                  ) : null}
                  <button className="btn small link" onClick={() => forget(u.hw)}>
                    Forget
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
