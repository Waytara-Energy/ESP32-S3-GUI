import { useEffect, useState } from "react";
import { Empty, Group, Page } from "@/components/kit";
import { useServices, type ActivityRow } from "@/services";
import { useApp } from "@/state";
import { Icon, Notice, Spinner } from "@/ui";

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const who = (r: ActivityRow): string => (r.actor_name ? `${r.actor_name}${r.actor_role ? ` · ${r.actor_role.replace("_", " ")}` : ""}` : r.source === "system" || r.source === "hub" ? "WayTara" : "");
const tone = (a: string): "" | "warn" | "bad" => (a === "device_offline" || a === "key_revoked" || a === "key_rotation_failed" || a === "setting_failed" ? "bad" : a === "wifi_removed" || a === "unit_restarted" || a === "unit_released" ? "warn" : "");
const ICON: Record<string, string> = { wifi_changed: "network", wifi_removed: "network", unit_restarted: "status", key_rotated: "key", key_revoked: "key", unit_claimed: "setup", push_interval_changed: "interval", device_renamed: "details", bluetooth_access: "units", device_offline: "status", device_online: "status" };

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
    <Page title="Activity log" sub={`${device.label} · ${device.site}. The newest 100 entries: who connected, what was changed, and when the device went offline or came back.`}>
      {error ? <Notice kind="bad">{error}</Notice> : null}
      {!rows && !error ? <Spinner label="Loading" /> : null}
      {rows && rows.length === 0 ? <Empty title="Nothing recorded yet" text="Changes to this device and its connection will appear here." /> : null}
      {rows && rows.length > 0 ? (
        <Group>
          <ul className="tl">
            {rows.map((r) => (
              <li key={r.id}>
                <span className={`ico ${tone(r.action)}`}>
                  <Icon name={ICON[r.action] ?? "activity"} size={16} />
                </span>
                <div>
                  <div className="what">{r.summary}</div>
                  {who(r) ? <div className="who">{who(r)}</div> : null}
                </div>
                <time dateTime={r.at}>{when(r.at)}</time>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
    </Page>
  );
}
