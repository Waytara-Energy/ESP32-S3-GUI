import { useServices } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Find a unit: one button scans for every WayTara unit in range, and the units opened before are listed for one-tap return. */
export function Units() {
  const services = useServices();
  const { connect, connecting, outcome, linkLost, error, unit, remembered, forget, setDevice, go, disconnect } = useApp();
  const supported = services.bluetoothAvailable();

  return (
    <>
      <PageHead title="Units" sub="Find the monitoring unit you want to work with. Stand next to it; Bluetooth reaches a few metres." />

      {!supported ? (
        <Notice kind="bad">
          This browser cannot use Bluetooth. Open this page in Chrome or Edge on an Android phone or a computer (not Safari, and not any browser on an iPhone), and make sure the address starts with https.
        </Notice>
      ) : (
        <section className="card">
          <h2>Scan for units</h2>
          <p className="sub">Your browser shows the WayTara units in range. Choose yours; you are let in according to your account.</p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn primary" onClick={() => void connect()} disabled={connecting}>
              {connecting ? <Spinner label="Connecting" /> : "Scan for units"}
            </button>
            {unit ? (
              <button className="btn" onClick={disconnect} disabled={connecting}>
                Disconnect from {unit.name}
              </button>
            ) : null}
          </div>
          {error ? <Notice kind="bad">{error}</Notice> : null}
          {linkLost ? <Notice kind="warn">The Bluetooth connection ended. The unit lets go of a phone that is quiet for 5 minutes. Scan again to reconnect.</Notice> : null}
          {outcome && outcome.kind !== "ready" && outcome.kind !== "cancelled" ? <Notice kind={outcome.kind === "new_unit" ? "info" : "warn"}>{outcome.message}</Notice> : null}
          {outcome?.kind === "ready" ? (
            <Notice kind="ok">
              Connected to {outcome.unit.name} for {outcome.unit.device?.label} at {outcome.unit.device?.site}.
            </Notice>
          ) : null}
          {outcome?.kind === "new_unit" && outcome.unit.level >= 4 ? (
            <div className="actions">
              <button className="btn primary" onClick={() => go("setup")}>
                Set this unit up
              </button>
            </div>
          ) : null}
        </section>
      )}

      <section className="card">
        <h2>Your units</h2>
        {remembered.length === 0 ? (
          <p className="sub">Units you open appear here, so next time it is one tap.</p>
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
                  {supported ? (
                    <button className="btn small primary" onClick={() => void connect(u.name)} disabled={connecting}>
                      Connect
                    </button>
                  ) : null}
                  {u.equipmentId && u.label ? (
                    <button
                      className="btn small"
                      onClick={() => {
                        setDevice({ equipmentId: u.equipmentId!, label: u.label!, site: u.site ?? "" });
                        go("activity");
                      }}
                    >
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
