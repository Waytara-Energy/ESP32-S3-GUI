import { describe, expect, it } from "vitest";
import { forgetUnit, loadUnits, rememberUnit, type RememberedUnit } from "./units-store";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};
const unit = (hw: string, over: Partial<RememberedUnit> = {}): RememberedUnit => ({ hw, name: `WayTara-${hw.slice(-6)}`, equipmentId: "e1", label: "Roof inverter", site: "Villa", seenAt: 1, ...over });

describe("remembered units", () => {
  it("puts the newest first and keeps one entry per unit", () => {
    const s = memory();
    rememberUnit(s, "u1", unit("AAAAAA000001"));
    rememberUnit(s, "u1", unit("AAAAAA000002"));
    const list = rememberUnit(s, "u1", unit("AAAAAA000001", { label: "Renamed" }));
    expect(list.map((u) => u.hw)).toEqual(["AAAAAA000001", "AAAAAA000002"]);
    expect(loadUnits(s, "u1")[0]!.label).toBe("Renamed");
  });

  it("keeps each person's list apart, and can forget a unit", () => {
    const s = memory();
    rememberUnit(s, "u1", unit("AAAAAA000001"));
    expect(loadUnits(s, "u2")).toEqual([]);
    expect(forgetUnit(s, "u1", "AAAAAA000001")).toEqual([]);
  });

  it("keeps at most 20 and never stores anything but names and ids", () => {
    const s = memory();
    for (let i = 0; i < 25; i++) rememberUnit(s, "u1", unit(`AAAAAA0000${String(i).padStart(2, "0")}`));
    expect(loadUnits(s, "u1")).toHaveLength(20);
    expect(JSON.stringify([...s.raw.values()])).not.toMatch(/grant|password/i);
  });

  it("copes with no storage, broken storage and damaged contents", () => {
    expect(loadUnits(null, "u1")).toEqual([]);
    expect(rememberUnit(null, "u1", unit("AAAAAA000001"))).toHaveLength(1);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadUnits(broken, "u1")).toEqual([]);
    expect(() => rememberUnit(broken, "u1", unit("AAAAAA000001"))).not.toThrow();
    expect(loadUnits({ getItem: () => "{not json" }, "u1")).toEqual([]);
    expect(loadUnits({ getItem: () => JSON.stringify([{ nope: 1 }, unit("AAAAAA000003")]) }, "u1").map((u) => u.hw)).toEqual(["AAAAAA000003"]);
  });
});
