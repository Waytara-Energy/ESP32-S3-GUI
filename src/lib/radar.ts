// What the radar shows: the units heard recently, each at a steady angle (from its id, so it does not jump around) and a distance that follows
// its signal strength (a stronger signal sits closer to the middle). Pure functions and a small model, tested without a browser.

export interface HeardUnit {
  id: string;
  name: string;
  rssi: number | null;
  /** the browser may open it without asking */
  device: unknown | null;
}

export interface Blip {
  id: string;
  name: string;
  /** smoothed signal strength in dBm, null if the browser does not report it */
  rssi: number | null;
  /** 0 to 360, from the id */
  angle: number;
  /** 0 (the middle) to 1 (the outer ring) */
  radius: number;
  lastSeen: number;
  device: unknown | null;
}

export const STALE_AFTER_MS = 12_000;
const RSSI_NEAR = -45;
const RSSI_FAR = -95;

export function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const angleOf = (id: string): number => hashOf(id) % 360;

/** Distance from the middle: about 0.2 for a very strong signal, 0.92 for a very weak one, in the middle of the ring when it is not reported. */
export function radiusOf(rssi: number | null): number {
  if (rssi === null) return 0.6;
  const t = (Math.min(RSSI_NEAR, Math.max(RSSI_FAR, rssi)) - RSSI_NEAR) / (RSSI_FAR - RSSI_NEAR);
  return 0.2 + t * 0.72;
}

export class RadarModel {
  private readonly blips = new Map<string, Blip>();

  /** A unit was heard. Returns true if it is new on the radar. */
  hear(h: HeardUnit, now: number): boolean {
    const prev = this.blips.get(h.id);
    const rssi = h.rssi === null ? (prev?.rssi ?? null) : prev?.rssi != null ? Math.round(prev.rssi * 0.7 + h.rssi * 0.3) : h.rssi;
    this.blips.set(h.id, {
      id: h.id,
      name: h.name,
      rssi,
      angle: prev?.angle ?? angleOf(h.id),
      radius: radiusOf(rssi),
      lastSeen: now,
      device: h.device ?? prev?.device ?? null,
    });
    return !prev;
  }

  /** The units still on the radar (heard within the last 12 seconds), nudged apart when two would sit on top of each other. */
  visible(now: number): Blip[] {
    for (const [id, b] of this.blips) if (now - b.lastSeen > STALE_AFTER_MS) this.blips.delete(id);
    const list = [...this.blips.values()].sort((a, b) => a.id.localeCompare(b.id));
    const placed: Blip[] = [];
    for (const b of list) {
      let angle = b.angle;
      for (let tries = 0; tries < 12; tries++) {
        const clash = placed.some((p) => Math.abs(p.radius - b.radius) < 0.14 && Math.min(Math.abs(p.angle - angle), 360 - Math.abs(p.angle - angle)) < 16);
        if (!clash) break;
        angle = (angle + 20) % 360;
      }
      placed.push({ ...b, angle });
    }
    return placed;
  }

  clear(): void {
    this.blips.clear();
  }
}

/** A blip's place in a square of the given size, for drawing: the angle 0 is at the top, clockwise. */
export function pointOf(b: Pick<Blip, "angle" | "radius">, size: number): { x: number; y: number } {
  const r = (size / 2) * 0.92 * b.radius;
  const a = ((b.angle - 90) * Math.PI) / 180;
  return { x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) };
}
