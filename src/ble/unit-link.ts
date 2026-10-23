import { DIR_FROM_UNIT, DIR_TO_UNIT, FLAG_HELLO, Reassembler, agreeKey, concat, openRecord, sealRecord, toFrames } from "./protocol";

/**
 * A conversation with one unit over an encrypted link. The radio is behind `Transport` (Web Bluetooth in the browser, a fake unit in
 * the tests). Requests are numbered; the unit answers each one with the same number.
 */

export interface UnitInfo {
  v: number;
  hw: string;
  fw: string;
  claimed: boolean;
  /** the unit's public key, base64url */
  pub: string;
}

export interface Transport {
  /** the plain info the unit offers before any key is agreed */
  readInfo(): Promise<UnitInfo>;
  /** writes one frame to the unit */
  write(frame: Uint8Array): Promise<void>;
  /** called with every frame the unit sends */
  onFrame(handler: (frame: Uint8Array) => void): void;
  onDisconnect(handler: () => void): void;
  disconnect(): void;
}

export class UnitError extends Error {
  constructor(
    message: string,
    readonly kind: "link" | "timeout" | "refused",
  ) {
    super(message);
    this.name = "UnitError";
  }
}

export interface Network {
  s: string;
  r: number;
  ch: number;
  o: boolean;
}
export interface JoinResult {
  connected: boolean;
  ssid?: string;
  rssi?: number;
  channel?: number;
  ms?: number;
  reason?: string;
}
export interface CheckStep {
  name: string;
  ok: boolean;
  skipped: boolean;
  ms: number;
  detail: string;
}
export interface CheckReport {
  steps: CheckStep[];
  all_ok: boolean;
}
export interface SpeedResult {
  rssi: number;
  channel: number;
  rtt_ms: number;
  down_kbps: number;
  up_kbps: number;
}
export interface UnitState {
  hw: string;
  fw: string;
  claimed: boolean;
  equipment_id?: string;
  hub?: string;
  hub_link?: boolean;
  clock?: boolean;
  wifi?: boolean;
  ssid?: string;
  rssi?: number;
  saved?: string[];
  /** what this connection may do: 0 nothing yet, 1 view, 2 network, 3 service, 4 admin (the open setup window counts as 4) */
  level?: number;
  setup_open?: boolean;
  heap_free?: number;
}

/** The unit's own view of itself, for the Status page. */
export interface UnitStatus {
  boot: number;
  uptime_s: number;
  wifi: boolean;
  ssid?: string;
  rssi?: number;
  channel?: number;
  ip?: string;
  clock: boolean;
  hub: string;
  hub_link: boolean;
  inverter_online: boolean;
  last_ok_age_s: number;
  ok_pct_5min: number;
  rounds: number;
  requests_failed: number;
  dead_registers: number;
  simulated: boolean;
  queue_frames: number;
  queue_bytes: number;
  dropped: number;
  seq_sent: number;
  seq_acked: number;
  map_ver: number;
  map_requests: number;
  map_writes: number;
  heap_free: number;
  /** the largest block still available, the lowest free memory since the start, and the external RAM (firmware 0.3.0-t16b and later) */
  heap_largest?: number;
  heap_min?: number;
  psram_free?: number;
}

/** One page of the register map the hub sent: reads are [start, count, seconds], writes are [register, mask, low, high]. */
export interface MapPage {
  ver: number;
  kind: "r" | "w";
  total: number;
  from: number;
  items: number[][];
  next?: number;
}

export interface LogLine {
  n: number;
  text: string;
}
/** One piece of a round of readings: raw registers as hex (4 digits each). `more` is true when the round continues in the next piece. */
export interface LiveBlocks {
  round: number;
  t: number;
  blocks: [number, string][];
  more: boolean;
}
export interface ClaimResult {
  equipment_id: string;
  key_id: string;
}

type Answer = { n: number; ok: boolean; why?: string } & Record<string, unknown>;

export type UplinkMode = "wifi" | "sim" | "auto";

/** How the unit reaches the internet, and the state of its SIM (the `net` command). */
export interface NetState {
  uplink: UplinkMode;
  apn: string;
  wifi: boolean;
  sim_running: boolean;
  sim_up: boolean;
  sim_state: string;
  sim_operator: string;
  /** signal quality 0 to 31 (99 = unknown) */
  sim_csq: number;
  /** only the last four digits of the card number leave the unit */
  sim_card: string;
  sim_ip: string;
  sim_attempts: number;
  sim_failures: number;
  ev: boolean;
}

/** The unit's own Wi-Fi network for EV chargers, and what its charger has said so far (the `ev_*` commands). */
export interface EvInfo {
  enabled: boolean;
  ssid?: string;
  password?: string;
  ip?: string;
  /** the charger name that is let in: the last part of the address */
  cp?: string;
  url?: string;
  connected: boolean;
  vendor: string;
  model: string;
  status: string;
  boots: number;
  heartbeats: number;
  meter_values: number;
  frames_up: number;
  frames_down: number;
  /** seconds since the charger last said anything, -1 = never */
  last_message_age_s: number;
  hub_link: boolean;
}

export class UnitLink {
  private key: CryptoKey | null = null;
  private txCounter = 0n;
  private rxCounter = 0n;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (a: Answer) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly reassembler = new Reassembler();
  private ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  info: UnitInfo | null = null;
  onClosed: (() => void) | null = null;
  /** lines of the unit's log, while `logs(true)` is on */
  onLog: ((lines: LogLine[]) => void) | null = null;
  /** pieces of the live readings, while `live(true)` is on */
  onLive: ((piece: LiveBlocks) => void) | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly t: Transport) {
    t.onFrame((f) => void this.handleFrame(f));
    t.onDisconnect(() => this.fail(new UnitError("The Bluetooth connection to the unit was lost.", "link")));
  }

  /** Reads the unit's info, agrees a key and waits for the unit's first encrypted message, which proves both sides have the same key. */
  async connect(readyTimeoutMs = 8000): Promise<UnitInfo> {
    const info = await this.t.readInfo();
    const keys = await agreeKey(info.pub);
    this.key = keys.key;
    this.txCounter = 0n;
    this.rxCounter = 0n;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new UnitError("The unit did not answer the key exchange. Close the setup window on the unit and open it again.", "timeout")), readyTimeoutMs);
      this.ready = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
    await this.t.write(concat(new Uint8Array([FLAG_HELLO]), keys.hello));
    await ready;
    this.info = info;
    // the unit lets go of a phone that is quiet for 5 minutes: a ping every minute says the page is still here
    this.keepAlive = setInterval(() => void this.request("ping", {}, 10_000).catch(() => undefined), 60_000);
    return info;
  }

  private async handleFrame(frame: Uint8Array): Promise<void> {
    if (!this.key) return;
    let record: Uint8Array | null;
    try {
      record = this.reassembler.push(frame);
    } catch {
      return;
    }
    if (!record) return;
    let opened;
    try {
      opened = await openRecord(this.key, DIR_FROM_UNIT, record);
    } catch {
      return; // not from the unit that holds our key: ignored
    }
    if (opened.counter <= this.rxCounter) return; // a repeat
    this.rxCounter = opened.counter;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(new TextDecoder().decode(opened.plain)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.ready === true && this.ready) {
      const r = this.ready;
      this.ready = null;
      r.resolve();
      return;
    }
    if (Array.isArray(msg.log)) {
      this.onLog?.((msg.log as [number, string][]).map(([n, text]) => ({ n, text })));
      return;
    }
    if (typeof msg.live === "number") {
      this.onLive?.({ round: msg.live, t: Number(msg.t ?? 0), blocks: (msg.b as [number, string][]) ?? [], more: msg.more === true });
      return;
    }
    const n = typeof msg.n === "number" ? msg.n : -1;
    const p = this.pending.get(n);
    if (p) {
      this.pending.delete(n);
      clearTimeout(p.timer);
      p.resolve(msg as Answer);
    }
  }

  /** One request at a time (the unit works on one thing at a time). Resolves with the unit's answer, ok or not. */
  request(command: string, args: Record<string, unknown> = {}, timeoutMs = 40_000): Promise<Answer> {
    const run = async (): Promise<Answer> => {
      if (this.closed || !this.key) throw new UnitError("Not connected to the unit.", "link");
      const n = ++this.seq;
      this.txCounter += 1n;
      const body = new TextEncoder().encode(JSON.stringify({ n, c: command, ...args }));
      const record = await sealRecord(this.key, DIR_TO_UNIT, this.txCounter, body);
      const answer = new Promise<Answer>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(n);
          reject(new UnitError(`The unit did not answer (${command}). Try again.`, "timeout"));
        }, timeoutMs);
        this.pending.set(n, { resolve, reject, timer });
      });
      try {
        for (const f of toFrames(record)) await this.t.write(f);
      } catch (e) {
        const p = this.pending.get(n);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(n);
        }
        throw new UnitError(e instanceof Error ? e.message : "Could not send to the unit.", "link");
      }
      return answer;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Like `request`, but a refusal by the unit is an error carrying the unit's reason. */
  private async ask<T>(command: string, args: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    const a = await this.request(command, args, timeoutMs);
    if (!a.ok) throw new UnitError(typeof a.why === "string" && a.why ? a.why : "The unit refused.", "refused");
    return a as unknown as T;
  }

  async state(): Promise<UnitState> {
    return this.ask<UnitState>("info");
  }
  /** Presents the grant the WayTara server signed for this person and this connection. Resolves with the access level it gives. */
  async auth(grant: string): Promise<number> {
    const r = await this.ask<{ level: number }>("auth", { grant }, 15_000);
    return Number(r.level);
  }
  ping(): Promise<unknown> {
    return this.ask("ping", {}, 10_000);
  }
  status(): Promise<UnitStatus> {
    return this.ask<UnitStatus>("status");
  }
  async logs(on: boolean, backlog = 40): Promise<void> {
    await this.ask("logs", { on, backlog });
  }
  async live(on: boolean): Promise<void> {
    await this.ask("live", { on });
  }
  map(kind: "r" | "w", from = 0): Promise<MapPage> {
    return this.ask<MapPage>("map", { kind, from });
  }
  /** Every page of the map, in order. */
  async fullMap(kind: "r" | "w"): Promise<{ ver: number; total: number; items: number[][] }> {
    const items: number[][] = [];
    let from = 0;
    let ver = 0;
    let total = 0;
    for (let guard = 0; guard < 20; guard++) {
      const p = await this.map(kind, from);
      ver = p.ver;
      total = p.total;
      items.push(...p.items);
      if (p.next === undefined) break;
      from = p.next;
    }
    return { ver, total, items };
  }
  async reboot(): Promise<void> {
    try {
      await this.ask("reboot", {}, 8000);
    } catch {
      /* the unit restarts as it answers */
    }
  }
  async scan(): Promise<Network[]> {
    return (await this.ask<{ networks: Network[] }>("scan")).networks ?? [];
  }
  join(ssid: string, pass: string): Promise<JoinResult> {
    return this.ask<JoinResult>("wifi", { ssid, pass }, 60_000);
  }
  async forgetNetworks(ssid?: string): Promise<void> {
    await this.ask("forget", ssid ? { ssid } : {});
  }
  net(): Promise<NetState> {
    return this.ask<NetState>("net");
  }
  /** Saves how the unit goes online. It restarts after this session (the unit says so by itself). */
  async setUplink(mode: UplinkMode, apn: string, pin: string): Promise<void> {
    await this.ask("uplink", { mode, apn, ...(pin ? { pin } : {}) });
  }
  /** Opens the unit's charger network and server for one charger name (the unit makes one when none is given). */
  evOpen(cp?: string): Promise<{ ssid: string; password: string; ip: string; cp: string; url: string; restart?: boolean }> {
    return this.ask("ev_open", cp ? { cp } : {});
  }
  evState(): Promise<EvInfo> {
    return this.ask<EvInfo>("ev_state");
  }
  /** Takes the charger network and server down and forgets the charger. */
  async evClose(): Promise<void> {
    await this.ask("ev_close");
  }
  checks(): Promise<CheckReport> {
    return this.ask<CheckReport>("checks", {}, 90_000);
  }
  speed(): Promise<SpeedResult> {
    return this.ask<SpeedResult>("speed", {}, 90_000);
  }
  async claim(ticket: string): Promise<ClaimResult> {
    const r = await this.ask<ClaimResult>("claim", { ticket }, 60_000);
    return { equipment_id: r.equipment_id, key_id: r.key_id };
  }
  async closeSetup(): Promise<void> {
    try {
      await this.ask("close", {}, 8000);
    } catch {
      /* the unit closes the link as it answers */
    }
  }

  disconnect(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    this.fail(new UnitError("Disconnected.", "link"), false);
    this.t.disconnect();
  }

  private fail(error: Error, notify = true): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
    this.ready?.reject(error);
    this.ready = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    if (notify) this.onClosed?.();
  }
}
