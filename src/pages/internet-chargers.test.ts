import { describe, expect, it } from "vitest";
import { fakeUnit } from "@/ble/fake-unit";
import { UnitLink } from "@/ble/unit-link";
import { NAV, canOpen } from "@/lib/roles";
import { evTests } from "./Chargers";
import { simSignal } from "./Internet";

async function connect(level: number) {
  const unit = await fakeUnit({ level, claimedAs: "eq-1" });
  const link = new UnitLink(unit.transport);
  await link.connect();
  return link;
}

describe("the SIM and charger commands", () => {
  it("reads how the unit goes online", async () => {
    const link = await connect(1);
    const n = await link.net();
    expect(n).toMatchObject({ uplink: "sim", apn: "airtelgprs.com", sim_up: true, sim_card: "…3165" });
  });

  it("lets a view-only grant look but not change the internet source or add a charger", async () => {
    const link = await connect(1);
    await expect(link.setUplink("sim", "airtelgprs.com", "")).rejects.toMatchObject({ kind: "refused" });
    await expect(link.evOpen()).rejects.toMatchObject({ kind: "refused" });
    await expect(link.evState()).rejects.toMatchObject({ kind: "refused" });
  });

  it("lets a Wi-Fi level grant set the SIM and open the charger network, and gives the address to type into the charger", async () => {
    const link = await connect(2);
    await expect(link.setUplink("auto", "airtelgprs.com", "")).resolves.toBeUndefined();
    const open = await link.evOpen();
    expect(open.url).toBe("ws://192.168.4.1:8080/ocpp/WT-05D0");
    const ev = await link.evState();
    expect(ev).toMatchObject({ enabled: true, connected: true, vendor: "Plugzmart" });
    await expect(link.evClose()).resolves.toBeUndefined();
  });
});

describe("the SIM signal in words", () => {
  it("names strength and says unknown for 99", () => {
    expect(simSignal(99).label).toBe("Unknown");
    expect(simSignal(28)).toMatchObject({ label: "Strong", tone: "ok" });
    expect(simSignal(14).label).toBe("Good");
    expect(simSignal(8)).toMatchObject({ label: "Weak", tone: "warn" });
    expect(simSignal(3)).toMatchObject({ label: "Very weak", tone: "bad" });
  });
});

describe("the charger tests", () => {
  const base = { enabled: true, connected: false, vendor: "", model: "", status: "", boots: 0, heartbeats: 0, meter_values: 0, frames_up: 0, frames_down: 0, last_message_age_s: -1, hub_link: true };

  it("waits for each step in order", () => {
    expect(evTests(base, false).every((t) => !t.ok)).toBe(true);
    const t = evTests({ ...base, connected: true, boots: 1, vendor: "Plugzmart", model: "7.4kW", status: "Available", heartbeats: 1 }, false);
    expect(t.map((x) => x.ok)).toEqual([true, true, true, false, false]);
    expect(t[1]!.detail).toBe("Plugzmart 7.4kW");
  });

  it("passes everything once meter values arrive and WayTara sees the charger", () => {
    const t = evTests({ ...base, connected: true, boots: 1, heartbeats: 2, meter_values: 3 }, true);
    expect(t.every((x) => x.ok)).toBe(true);
  });
});

describe("who may open the new pages", () => {
  it("offers Internet to anyone connected to a unit and EV chargers once a device is known", () => {
    const internet = NAV.find((n) => n.id === "internet")!;
    const chargers = NAV.find((n) => n.id === "chargers")!;
    expect(canOpen(internet, { level: 1, role: "customer", hasDevice: false }).ok).toBe(true);
    expect(canOpen(chargers, { level: 2, role: "customer", hasDevice: false })).toMatchObject({ ok: false });
    expect(canOpen(chargers, { level: 2, role: "customer", hasDevice: true }).ok).toBe(true);
  });
});
