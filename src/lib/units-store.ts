// The units this person has opened on this phone or computer, so the next visit is one tap. Kept in this browser only, per signed-in person;
// it holds names and hardware ids, never a key, a grant or a password. Every storage call is guarded: the page works without it.

export interface RememberedUnit {
  hw: string;
  /** the Bluetooth name ("WayTara-xxxxxx"), which the browser's chooser can be filtered by */
  name: string;
  equipmentId: string | null;
  label: string | null;
  site: string | null;
  seenAt: number;
}

const MAX_UNITS = 20;
const keyOf = (userId: string) => `wt-units-v1:${userId}`;

export function loadUnits(storage: Pick<Storage, "getItem"> | null, userId: string): RememberedUnit[] {
  try {
    const raw = storage?.getItem(keyOf(userId));
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((u): u is RememberedUnit => !!u && typeof u === "object" && typeof (u as RememberedUnit).hw === "string" && typeof (u as RememberedUnit).name === "string")
      .map((u) => ({ hw: u.hw, name: u.name, equipmentId: u.equipmentId ?? null, label: u.label ?? null, site: u.site ?? null, seenAt: Number(u.seenAt) || 0 }))
      .slice(0, MAX_UNITS);
  } catch {
    return [];
  }
}

function save(storage: Pick<Storage, "setItem"> | null, userId: string, list: RememberedUnit[]): void {
  try {
    storage?.setItem(keyOf(userId), JSON.stringify(list.slice(0, MAX_UNITS)));
  } catch {
    /* private window or full: not remembered */
  }
}

/** Puts a unit first (replacing an earlier entry for the same hardware id) and returns the new list. */
export function rememberUnit(storage: Pick<Storage, "getItem" | "setItem"> | null, userId: string, u: RememberedUnit): RememberedUnit[] {
  const list = [u, ...loadUnits(storage, userId).filter((x) => x.hw !== u.hw)].slice(0, MAX_UNITS);
  save(storage, userId, list);
  return list;
}

export function forgetUnit(storage: Pick<Storage, "getItem" | "setItem"> | null, userId: string, hw: string): RememberedUnit[] {
  const list = loadUnits(storage, userId).filter((x) => x.hw !== hw);
  save(storage, userId, list);
  return list;
}
