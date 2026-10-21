import { useEffect, useState } from "react";
import { useServices, type ActivityRow } from "@/services";
import { useApp } from "@/state";
import { Notice, PageHead, Spinner } from "@/ui";

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const who = (r: ActivityRow): string => (r.actor_name ? `${r.actor_name}${r.actor_role ? ` (${r.actor_role.replace("_", " ")})` : ""}` : r.source === "system" || r.source === "hub" ? "WayTara" : "–");

/** Who did what to the unit and its site, and when. Read from the database under the same access rules as the dashboard. */
export function Activity() {
  const services = useServices();
  const { device } = useApp();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) return;
    let live = true;
    setRows(null);
    services.activity(device.equipmentId).then(
      (r) => live && setRows(r),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load the activity log."),
    );
    return () => {
      live = false;
    };
  }, [device, services]);

  if (!device) return null;
  return (
    <>
      <PageHead title="Activity log" sub={`${device.label} · ${device.site}. The newest 100 entries.`} />
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!rows && !error ? <Spinner label="Loading" /> : null}
      {rows && rows.length === 0 ? <Notice kind="info">Nothing has been recorded for this device yet.</Notice> : null}
      {rows && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                  <td>{r.summary}</td>
                  <td className="sub">{who(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
