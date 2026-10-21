// What happens between "the person pressed Scan for units" and "the pages can use the unit": find the unit, work out which device it belongs
// to, ask the WayTara server for a pass (grant) for this person on this very connection, present it to the unit, and read what the unit says it
// may do. Written against the Services interface so it is tested with a fake unit and no radio.

import { UnitError, type UnitLink, type UnitState } from "@/ble/unit-link";
import { GatewayApiError } from "./gateway-api";
import type { Device, Services } from "@/services";

export interface ConnectedUnit {
  link: UnitLink;
  /** the Bluetooth name, e.g. WayTara-5505D0 */
  name: string;
  hw: string;
  fw: string;
  claimed: boolean;
  /** the access level this connection has now: 0 none, 1 view, 2 view and Wi-Fi, 3 service, 4 administrator (or the setup window is open) */
  level: number;
  /** what the unit said about itself once it let us in (null while it would say nothing) */
  state: UnitState | null;
  /** the device the unit belongs to, when this person may see it */
  device: Device | null;
}

export type ConnectOutcome =
  | { kind: "cancelled" }
  /** a unit of a device this person can see, and the unit let them in */
  | { kind: "ready"; unit: ConnectedUnit }
  /** a unit that has not been set up yet: it belongs to no device */
  | { kind: "new_unit"; unit: ConnectedUnit; message: string }
  /** a unit that is set up, but for a device this person cannot see (or that is not registered) */
  | { kind: "not_found"; unit: ConnectedUnit; message: string }
  /** the unit's device is known, but no pass could be had or the unit refused it */
  | { kind: "no_access"; unit: ConnectedUnit; message: string };

const NEW_UNIT = "This unit has not been set up yet. Hold the BOOT button on it for 3 seconds to open its setup, then open the Setup page.";
const NOT_FOUND = "This unit is set up, but not for a device you can see. If it is yours, ask WayTara to give you access to the site. Nothing more can be shown about it.";

function reasonOf(e: unknown): string {
  if (e instanceof GatewayApiError) return e.status === 404 ? "You do not have access to this unit's device." : e.message;
  if (e instanceof UnitError) return e.message;
  return e instanceof Error ? e.message : "Could not get access to the unit.";
}

export async function connectFlow(services: Services, preferName?: string): Promise<ConnectOutcome> {
  const s = await services.connectUnit(preferName);
  if (!s) return { kind: "cancelled" };

  const device = await services.resolveUnit(s.info.hw);
  const unit: ConnectedUnit = { link: s.link, name: s.name, hw: s.info.hw, fw: s.info.fw, claimed: s.info.claimed, level: 0, state: null, device };

  let denied: string | null = null;
  if (device) {
    try {
      const g = await services.requestGrant(device.equipmentId, s.info.pub);
      unit.level = await s.link.auth(g.grant);
    } catch (e) {
      denied = reasonOf(e);
    }
  }
  // A unit with its setup window open (the BOOT button) lets anybody next to it in at the top level; look at what it says either way.
  try {
    unit.state = await s.link.state();
    unit.level = Math.max(unit.level, unit.state.level ?? 0);
    unit.fw = unit.state.fw || unit.fw;
  } catch {
    /* the unit says nothing to a connection without access */
  }

  if (!device) return unit.claimed ? { kind: "not_found", unit, message: NOT_FOUND } : { kind: "new_unit", unit, message: NEW_UNIT };
  if (unit.level < 1) return { kind: "no_access", unit, message: denied ?? "The unit did not accept your access." };
  return { kind: "ready", unit };
}
