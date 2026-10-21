import { describe, expect, it } from "vitest";
import { RadarModel, STALE_AFTER_MS, angleOf, pointOf, radiusOf } from "./radar";

const unit = (id: string, rssi: number | null = -60) => ({ id, name: `WayTara-${id}`, rssi, device: null });

describe("the radar", () => {
  it("puts a stronger signal nearer the middle, and keeps the distance in range", () => {
    expect(radiusOf(-45)).toBeCloseTo(0.2);
    expect(radiusOf(-95)).toBeCloseTo(0.92);
    expect(radiusOf(-30)).toBeCloseTo(0.2);
    expect(radiusOf(-120)).toBeCloseTo(0.92);
    expect(radiusOf(-55)).toBeLessThan(radiusOf(-75));
    expect(radiusOf(null)).toBe(0.6);
  });

  it("gives a unit the same angle every time", () => {
    expect(angleOf("AABBCC")).toBe(angleOf("AABBCC"));
    expect(angleOf("AABBCC")).not.toBe(angleOf("AABBCD"));
    expect(angleOf("x")).toBeGreaterThanOrEqual(0);
    expect(angleOf("x")).toBeLessThan(360);
  });

  it("shows a unit once heard, says whether it is new, and smooths its signal", () => {
    const m = new RadarModel();
    expect(m.hear(unit("a", -60), 0)).toBe(true);
    expect(m.hear(unit("a", -80), 1000)).toBe(false);
    const [b] = m.visible(1000);
    expect(b!.rssi).toBe(-66); // 70% of the old, 30% of the new
    expect(m.visible(1000)).toHaveLength(1);
  });

  it("takes a unit off when it has not been heard for 12 seconds, and brings it back when it is", () => {
    const m = new RadarModel();
    m.hear(unit("a"), 0);
    expect(m.visible(STALE_AFTER_MS)).toHaveLength(1);
    expect(m.visible(STALE_AFTER_MS + 1)).toHaveLength(0);
    expect(m.hear(unit("a"), 20_000)).toBe(true);
  });

  it("keeps the last known signal when an advertisement does not report one, and remembers that the browser may open the unit", () => {
    const m = new RadarModel();
    const device = {};
    m.hear({ ...unit("a", -70), device }, 0);
    m.hear(unit("a", null), 500);
    const [b] = m.visible(500);
    expect(b!.rssi).toBe(-70);
    expect(b!.device).toBe(device);
  });

  it("moves two units apart when they would sit on top of each other", () => {
    const m = new RadarModel();
    // two ids with the same angle and signal: find a pair by search
    const ids: string[] = [];
    const seen = new Map<number, string>();
    for (let i = 0; i < 5000 && ids.length < 2; i++) {
      const id = `u${i}`;
      const a = angleOf(id);
      if (seen.has(a)) ids.push(seen.get(a)!, id);
      else seen.set(a, id);
    }
    expect(ids).toHaveLength(2);
    for (const id of ids) m.hear(unit(id, -60), 0);
    const [p, q] = m.visible(0);
    const gap = Math.min(Math.abs(p!.angle - q!.angle), 360 - Math.abs(p!.angle - q!.angle));
    expect(gap).toBeGreaterThanOrEqual(16);
  });

  it("places a blip in a square: angle 0 at the top, clockwise, the middle at radius 0", () => {
    expect(pointOf({ angle: 0, radius: 0 }, 400)).toEqual({ x: 200, y: 200 });
    const top = pointOf({ angle: 0, radius: 1 }, 400);
    expect(top.x).toBeCloseTo(200);
    expect(top.y).toBeLessThan(200);
    const right = pointOf({ angle: 90, radius: 1 }, 400);
    expect(right.x).toBeGreaterThan(200);
    expect(right.y).toBeCloseTo(200);
  });
});
