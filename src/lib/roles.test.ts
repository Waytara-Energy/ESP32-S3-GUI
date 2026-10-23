import { describe, expect, it } from "vitest";
import { NAV, canOpen, groups, isStaff, levelName, type Ctx } from "./roles";

const open = (id: string, c: Ctx) => canOpen(NAV.find((n) => n.id === id)!, c);

describe("which pages each person can open", () => {
  it("lets a customer with a view-and-Wi-Fi grant see the unit, change the Wi-Fi and read the log, and nothing of the service pages", () => {
    const c: Ctx = { level: 2, role: "customer", hasDevice: true };
    for (const id of ["units", "overview", "details", "status", "network", "live", "activity"]) expect(open(id, c).ok, id).toBe(true);
    for (const id of ["map", "logs", "setup", "interval", "key"]) expect(open(id, c).ok, id).toBe(false);
    expect(open("interval", c)).toMatchObject({ reason: "For WayTara staff only." });
  });

  it("gives assigned staff the service pages but not the administrator ones", () => {
    const c: Ctx = { level: 3, role: "employee", hasDevice: true };
    for (const id of ["map", "logs", "interval", "key", "network"]) expect(open(id, c).ok, id).toBe(true);
    expect(open("setup", c)).toMatchObject({ ok: false });
  });

  it("gives an administrator, or anyone at the unit with its setup window open, the setup page", () => {
    expect(open("setup", { level: 4, role: "admin", hasDevice: true }).ok).toBe(true);
    expect(open("setup", { level: 4, role: "site_engineer", hasDevice: false }).ok).toBe(true);
  });

  it("asks for a unit before the pages that talk to one, and for a device before the pages that need one", () => {
    const c: Ctx = { level: null, role: "admin", hasDevice: false };
    expect(open("status", c)).toMatchObject({ ok: false, reason: "Connect to a unit first." });
    expect(open("interval", c)).toMatchObject({ ok: false, reason: "Choose a unit or device first." });
    expect(open("units", c).ok).toBe(true);
  });

  it("works the hub and database pages without a Bluetooth connection once a device is chosen", () => {
    const c: Ctx = { level: null, role: "admin", hasDevice: true };
    for (const id of ["interval", "key", "activity"]) expect(open(id, c).ok, id).toBe(true);
  });

  it("names the roles and levels, and groups the menu", () => {
    expect(isStaff("site_engineer")).toBe(true);
    expect(isStaff("customer")).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(levelName(3)).toBe("Service");
    expect(levelName(9)).toBe("No access");
    expect(groups(NAV).map((g) => g.name)).toEqual(["Find", "Device", "Connectivity", "Devices", "Data", "Configuration", "Diagnostics"]);
  });
});
