import { describe, expect, it } from "vitest";
import { fakeUnit } from "@/ble/fake-unit";
import { UnitLink } from "@/ble/unit-link";
import type { Device, Services, UnitSession } from "@/services";
import { GatewayApiError } from "./gateway-api";
import { connectFlow } from "./connect-flow";

const TARGET = { id: "u", name: "WayTara-33F3", rssi: -60, device: null };

const DEVICE: Device = { equipmentId: "e1", label: "Roof inverter", site: "Villa" };

/** A page's services around a fake unit: what the database knows, what the hub would answer, and what the unit does. */
async function setup(o: { unit?: Parameters<typeof fakeUnit>[0]; device?: Device | null; grant?: { level: number } | Error | "none" } = {}) {
  const unit = await fakeUnit({ hw: "AABBCC0033F3", level: 0, ...o.unit });
  const grantsAsked: { equipmentId: string; pub: string }[] = [];
  const services = {
    connectUnit: async (): Promise<UnitSession | null> => {
      const link = new UnitLink(unit.transport);
      const info = await link.connect();
      return { link, info, name: "WayTara-33F3" };
    },
    resolveUnit: async () => (o.device === undefined ? DEVICE : o.device),
    requestGrant: async (equipmentId: string, pub: string) => {
      grantsAsked.push({ equipmentId, pub });
      const g = o.grant ?? { level: 3 };
      if (g instanceof Error) throw g;
      return { grant: `grant-${(g as { level: number }).level}`, level: (g as { level: number }).level, level_name: "service" as const, expires_in: 120 };
    },
  } as unknown as Services;
  return { unit, services, grantsAsked };
}

describe("connecting to a unit", () => {
  it("asks for a grant for the unit's device on this connection, presents it, and reports the level the unit gave", async () => {
    const { unit, services, grantsAsked } = await setup();
    const r = await connectFlow(services, TARGET);
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.unit).toMatchObject({ level: 3, hw: "AABBCC0033F3", device: DEVICE });
    expect(grantsAsked).toEqual([{ equipmentId: "e1", pub: unit.info.pub }]); // the unit's key for this connection, so the grant fits only here
    expect(unit.seen.map((s) => s.c)).toEqual(["auth", "info"]);
    expect(r.unit.state?.level).toBe(3);
  });

  it("gives a customer's grant the lower level the hub chose", async () => {
    const { services } = await setup({ grant: { level: 2 } });
    const r = await connectFlow(services, TARGET);
    expect(r).toMatchObject({ kind: "ready", unit: { level: 2 } });
  });

  it("says so when nobody chose a unit", async () => {
    const services = { connectUnit: async () => null } as unknown as Services;
    expect(await connectFlow(services, TARGET)).toEqual({ kind: "cancelled" });
  });

  it("tells a new unit apart: it has no device, and its setup window (the BOOT button) is what lets anyone in", async () => {
    const closed = await setup({ device: null });
    expect(await connectFlow(closed.services, TARGET)).toMatchObject({ kind: "new_unit", unit: { level: 0, device: null } });
    const open = await setup({ device: null, unit: { level: 4 } });
    const r = await connectFlow(open.services, TARGET);
    expect(r).toMatchObject({ kind: "new_unit", unit: { level: 4 } });
    expect(open.grantsAsked).toEqual([]); // no device, so nothing to ask the hub for
  });

  it("says plainly when a unit is set up for a device this person cannot see, and shows nothing else about it", async () => {
    const { services } = await setup({ device: null, unit: { claimedAs: "somebody-elses" } });
    const r = await connectFlow(services, TARGET);
    expect(r.kind).toBe("not_found");
    if (r.kind === "not_found") {
      expect(r.message).toMatch(/not for a device you can see/);
      expect(r.unit.level).toBe(0);
      expect(r.unit.state).toBeNull();
    }
  });

  it("reports why access was refused: the hub's words, or the unit's", async () => {
    const hub = await setup({ grant: new GatewayApiError(409, "The unit is changing its key right now. Try again in a few minutes.") });
    expect(await connectFlow(hub.services, TARGET)).toMatchObject({ kind: "no_access", message: "The unit is changing its key right now. Try again in a few minutes.", unit: { level: 0 } });
    const none = await setup({ grant: new GatewayApiError(404, "x") });
    expect(await connectFlow(none.services, TARGET)).toMatchObject({ kind: "no_access", message: "You do not have access to this unit's device." });
  });

  it("lets staff standing at the unit in through its setup window even when the hub gave no grant", async () => {
    const { services } = await setup({ unit: { level: 4 }, grant: new GatewayApiError(503, "The service is unavailable right now. Try again in a moment.") });
    const r = await connectFlow(services, TARGET);
    expect(r).toMatchObject({ kind: "ready", unit: { level: 4 } });
  });
});
