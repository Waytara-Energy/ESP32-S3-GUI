// Who may open which page. The real limits are enforced elsewhere (the unit checks the grant's level, the hub and the database check the
// person); this decides what the menu offers and says why a page is closed, in plain words.

export type PageId = "units" | "details" | "overview" | "status" | "network" | "chargers" | "live" | "map" | "setup" | "interval" | "key" | "logs" | "activity";

export const LEVEL_NAMES: Record<number, string> = { 0: "No access", 1: "View", 2: "View and Wi-Fi", 3: "Service", 4: "Administrator" };
export const levelName = (n: number): string => LEVEL_NAMES[n] ?? LEVEL_NAMES[0]!;

const STAFF = new Set(["admin", "employee", "site_engineer"]);
export const isStaff = (role: string | null | undefined): boolean => !!role && STAFF.has(role);
export const roleName = (role: string | null | undefined): string =>
  role === "admin" ? "Administrator" : role === "employee" ? "Employee" : role === "site_engineer" ? "Installer" : role === "customer" ? "Customer" : "Signed in";

export interface NavItem {
  id: PageId;
  label: string;
  group: string;
  /** needs a Bluetooth connection to a unit at this access level (0 = none needed) */
  minLevel: number;
  needsUnit: boolean;
  /** needs a device to be known (from a unit that was found, or one chosen from the list) */
  needsDevice: boolean;
  staffOnly: boolean;
}

const item = (id: PageId, label: string, group: string, o: Partial<NavItem> = {}): NavItem => ({ id, label, group, minLevel: 0, needsUnit: false, needsDevice: false, staffOnly: false, ...o });

export const NAV: NavItem[] = [
  item("units", "Units", "Find"),
  item("overview", "Overview", "Device", { needsUnit: true, minLevel: 1 }),
  item("details", "Device name", "Device", { needsDevice: true }),
  item("status", "Status", "Device", { needsUnit: true, minLevel: 1 }),
  item("network", "Network", "Connectivity", { needsUnit: true, minLevel: 1 }),
  item("chargers", "EV chargers", "Devices", { needsUnit: true, minLevel: 1, needsDevice: true }),
  item("live", "Live readings", "Data", { needsUnit: true, minLevel: 1 }),
  item("map", "Register map", "Data", { needsUnit: true, minLevel: 3 }),
  item("setup", "Setup", "Configuration", { needsUnit: true, minLevel: 4 }),
  item("interval", "Push interval", "Configuration", { needsDevice: true, staffOnly: true }),
  item("key", "Key", "Configuration", { needsDevice: true, staffOnly: true }),
  item("logs", "Live logs", "Diagnostics", { needsUnit: true, minLevel: 3 }),
  item("activity", "Activity log", "Diagnostics", { needsDevice: true }),
];

export interface Ctx {
  /** the access level of the connected unit, or null when no unit is connected */
  level: number | null;
  role: string | null;
  hasDevice: boolean;
}

/** Open, or why not. */
export function canOpen(n: NavItem, c: Ctx): { ok: true } | { ok: false; reason: string } {
  if (n.staffOnly && !isStaff(c.role)) return { ok: false, reason: "For WayTara staff only." };
  if (n.needsUnit && c.level === null) return { ok: false, reason: "Connect to a unit first." };
  if (n.needsUnit && (c.level ?? 0) < n.minLevel) {
    return {
      ok: false,
      reason:
        n.minLevel >= 4
          ? "Needs administrator access, or the unit's setup window (hold BOOT for 3 seconds)."
          : n.minLevel === 3
            ? "Needs service access (WayTara staff assigned to this site)."
            : "Your access does not allow this.",
    };
  }
  if (n.needsDevice && !c.hasDevice) return { ok: false, reason: "Choose a unit or device first." };
  return { ok: true };
}

export const groups = (items: NavItem[]): { name: string; items: NavItem[] }[] => {
  const out: { name: string; items: NavItem[] }[] = [];
  for (const i of items) {
    let g = out.find((x) => x.name === i.group);
    if (!g) out.push((g = { name: i.group, items: [] }));
    g.items.push(i);
  }
  return out;
};
