import { useEffect, useMemo, useState } from "react";
import { useServices, type Equipment } from "@/services";
import { Notice, Spinner } from "@/ui";

export type { Equipment };

export function PickEquipment({ selected, onPick }: { selected: Equipment | null; onPick: (e: Equipment) => void }) {
  const services = useServices();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    services.listEquipment().then(
      (r) => !cancelled && setItems(r),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not load your devices."),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, services]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || `${i.site} ${i.name} ${i.model ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);
  const sites = useMemo(() => [...new Set(shown.map((i) => i.site))], [shown]);

  return (
    <section className="card">
      <h1>Which device is this unit for?</h1>
      <p className="sub">Choose the inverter the monitoring unit is wired to. The unit will report as this device.</p>
      {error ? (
        <>
          <Notice kind="bad">Could not load your devices: {error}</Notice>
          <div className="actions">
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        </>
      ) : items === null ? (
        <Spinner label="Loading your devices" />
      ) : items.length === 0 ? (
        <Notice kind="info">No inverters are available to you. Ask a WayTara administrator to assign you to the site.</Notice>
      ) : (
        <>
          <label className="field">
            <span className="visually-hidden">Search</span>
            <input className="input" type="search" placeholder="Search by site or device" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {shown.length === 0 ? <p className="sub">Nothing matches “{query}”.</p> : null}
          {sites.map((site) => (
            <div key={site}>
              <p className="group">{site}</p>
              <ul className="list">
                {shown
                  .filter((i) => i.site === site)
                  .map((i) => (
                    <li key={i.id}>
                      <button className={`item${selected?.id === i.id ? " selected" : ""}`} aria-pressed={selected?.id === i.id} onClick={() => onPick(i)}>
                        <span>
                          <strong>{i.name}</strong>
                          {i.model ? <span className="meta"> · {i.model}</span> : null}
                        </span>
                        <span className="meta">{selected?.id === i.id ? "Selected" : "Choose"}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
