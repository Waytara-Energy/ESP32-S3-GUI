// A unit as the firmware behaves, for the tests and for the demo page (`/?demo` while developing): the same key agreement, the same framing
// and a few commands, on the other end of the Transport. Not part of the production page.
import { DIR_FROM_UNIT, DIR_TO_UNIT, FLAG_HELLO, Reassembler, concat, openRecord, sealRecord, toFrames } from "./protocol";
import type { Transport, UnitInfo } from "./unit-link";

const buf = (u: Uint8Array) => u as unknown as BufferSource;
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

/** A unit as the firmware behaves, on the other end of the Transport: same key agreement, same framing, a few commands. */
export async function fakeUnit(
  opts: {
    claimedAs?: string;
    delayMs?: number;
    hw?: string;
    fw?: string;
    /** the access level the unit starts at (default 4, as with the setup window open); a grant "grant-<level>" raises it, as a real grant would */
    level?: number;
    answer?: (c: string, args: Record<string, unknown>) => Record<string, unknown>;
  } = {},
) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const info: UnitInfo = { v: 1, hw: opts.hw ?? "2884855505D0", fw: opts.fw ?? "waytara-gw-0.3.0-t16", claimed: !!opts.claimedAs, pub: b64u(pub) };
  const state = { level: opts.level ?? 4 };
  let key: CryptoKey | null = null;
  let rxCounter = 0n;
  let txCounter = 0n;
  const reassembler = new Reassembler();
  let toPage: (f: Uint8Array) => void = () => undefined;
  let drop: () => void = () => undefined;
  const seen: { c: string; args: Record<string, unknown> }[] = [];
  const dropNext = { replies: 0 };
  let lastSent: Uint8Array[] = [];

  async function sendJson(obj: object) {
    txCounter += 1n;
    const record = await sealRecord(key!, DIR_FROM_UNIT, txCounter, new TextEncoder().encode(JSON.stringify(obj)));
    lastSent = toFrames(record, 20); // the unit's pieces are small (the link's MTU)
    for (const f of lastSent) toPage(f);
  }

  const transport: Transport = {
    readInfo: async () => info,
    onFrame: (h) => (toPage = h),
    onDisconnect: (h) => (drop = h),
    disconnect: () => undefined,
    async write(frame) {
      if (frame[0] === FLAG_HELLO) {
        const pagePub = frame.slice(1);
        const pagePubKey = await crypto.subtle.importKey("raw", buf(pagePub), { name: "ECDH", namedCurve: "P-256" }, false, []);
        const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: pagePubKey }, pair.privateKey, 256);
        const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
        key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: buf(concat(pub, pagePub)), info: buf(new TextEncoder().encode("waytara/v1/ble")) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        await sendJson({ ready: true });
        return;
      }
      const record = reassembler.push(frame);
      if (!record) return;
      const { counter, plain } = await openRecord(key!, DIR_TO_UNIT, record);
      if (counter <= rxCounter) return;
      rxCounter = counter;
      const req = JSON.parse(new TextDecoder().decode(plain)) as { n: number; c: string } & Record<string, unknown>;
      seen.push({ c: req.c, args: req });
      if (dropNext.replies > 0) {
        dropNext.replies--;
        return;
      }
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const need = minLevel(req.c);
      if (state.level < need) {
        await sendJson({ n: req.n, ok: false, why: state.level === 0 ? "sign in first (or hold the BOOT button for 3 seconds)" : "your access does not allow this", need, level: state.level });
        return;
      }
      if (req.c === "auth") {
        const m = /^grant-([0-9])$/.exec(String(req.grant ?? ""));
        if (!m) {
          await sendJson({ n: req.n, ok: false, why: "the grant is not valid" });
          return;
        }
        state.level = Number(m[1]);
        await sendJson({ n: req.n, ok: true, level: state.level });
        return;
      }
      const body = opts.answer?.(req.c, req) ?? defaults(req.c, { ...req, __level: state.level, __claimed: !!opts.claimedAs, __equipment: opts.claimedAs, __hw: info.hw, __fw: info.fw });
      await sendJson({ n: req.n, ok: true, ...body });
    },
  };
  return { transport, info, seen, sendJson, state, dropLink: () => drop(), silence: (n: number) => (dropNext.replies = n), push: (f: Uint8Array) => toPage(f), get lastSent() { return lastSent; } };
}

/** The lowest access level each command needs, as in the firmware (ble_setup.cpp). */
export function minLevel(c: string): number {
  if (c === "ping" || c === "auth" || c === "close") return 0;
  if (c === "info" || c === "status" || c === "live") return 1;
  if (c === "logs" || c === "map") return 3;
  if (c === "scan" || c === "wifi" || c === "forget") return 2;
  if (c === "checks" || c === "speed" || c === "hub" || c === "reboot") return 3;
  return 4;
}

export function defaults(c: string, req: Record<string, unknown>): Record<string, unknown> {
  switch (c) {
    case "scan":
      return { networks: [{ s: "Home", r: -50, ch: 6, o: false }, { s: "Guest", r: -70, ch: 1, o: true }, { s: "Home", r: -78, ch: 11, o: false }, { s: "Neighbour 5G", r: -84, ch: 36, o: false }] };
    case "speed":
      return { rssi: -58, channel: 6, rtt_ms: 140, down_kbps: 5200, up_kbps: 2100 };
    case "wifi":
      return { connected: true, ssid: req.ssid, rssi: -55, channel: 6, ms: 2300 };
    case "info":
      return {
        hw: req.__hw ?? "2884855505D0",
        fw: req.__fw ?? "waytara-gw-0.3.0-t16",
        claimed: req.__claimed ?? false,
        ...(req.__equipment ? { equipment_id: req.__equipment } : {}),
        hub: "hub.waytaraenergy.com",
        hub_link: true,
        wifi: true,
        ssid: "Home",
        rssi: -55,
        saved: ["Home"],
        clock: true,
        level: req.__level ?? 0,
        setup_open: (req.__level ?? 0) === 4,
        heap_free: 140000,
      };
    case "status":
      return {
        boot: 3, uptime_s: 5400, wifi: true, ssid: "Home", rssi: -55, channel: 6, ip: "192.168.1.40", clock: true, hub: "hub.waytaraenergy.com", hub_link: true,
        inverter_online: true, last_ok_age_s: 2, ok_pct_5min: 100, rounds: 1080, requests_failed: 0, dead_registers: 0, simulated: false,
        queue_frames: 3, queue_bytes: 900, dropped: 0, seq_sent: 1080, seq_acked: 1077, map_ver: 4, map_requests: 3, map_writes: 2, heap_free: 140000,
      };
    case "map":
      return req.kind === "w"
        ? { ver: 4, kind: "w", total: 2, from: 0, items: [[142, 65535, 0, 1], [143, 65535, 10, 100]] }
        : { ver: 4, kind: "r", total: 3, from: 0, items: [[186, 5, 5], [150, 20, 10], [60, 10, 300]] };
    case "checks":
      return { steps: [{ name: "wifi", ok: true, skipped: false, ms: 5, detail: "connected" }], all_ok: true };
    case "claim":
      return { equipment_id: "eq-1", key_id: "key-1" };
    default:
      return {};
  }
}
