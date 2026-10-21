import { INFO_UUID, RX_UUID, SERVICE_UUID, TX_UUID } from "./protocol";
import type { Transport, UnitInfo } from "./unit-link";

// Only the parts of Web Bluetooth this page uses (the browser's own types are not part of TypeScript's DOM library).
interface Characteristic extends EventTarget {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  startNotifications(): Promise<Characteristic>;
}
interface Service {
  getCharacteristic(uuid: string): Promise<Characteristic>;
}
interface GattServer {
  connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<Service>;
}
export interface BluetoothDeviceLike extends EventTarget {
  id?: string;
  name?: string;
  gatt?: GattServer;
  watchAdvertisements?(options?: { signal?: AbortSignal }): Promise<void>;
}
export interface AdvertisementEventLike extends Event {
  device: BluetoothDeviceLike;
  rssi?: number;
  name?: string;
}
interface BluetoothLike extends EventTarget {
  requestDevice(options: { filters: ({ services: string[] } | { name: string } | { namePrefix: string })[]; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
  getDevices?(): Promise<BluetoothDeviceLike[]>;
  requestLEScan?(options: { filters: { services: string[] }[]; keepRepeatedDevices?: boolean }): Promise<{ stop(): void }>;
}

const bluetooth = (): BluetoothLike | undefined => (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth;

export function webBluetoothAvailable(): boolean {
  return !!bluetooth() && window.isSecureContext;
}

export class BluetoothCancelled extends Error {
  constructor() {
    super("No unit was chosen.");
    this.name = "BluetoothCancelled";
  }
}

/** What this browser can do without showing its own device chooser. */
export interface ScanCapabilities {
  /** it can list the units this browser was allowed to use before, and tell when they are in range */
  remembered: boolean;
  /** it can listen for every WayTara unit in range (an experimental browser feature) */
  everyUnit: boolean;
}

export function scanCapabilities(): ScanCapabilities {
  const bt = bluetooth();
  return {
    remembered: !!bt && typeof bt.getDevices === "function" && typeof BluetoothDeviceProto()?.watchAdvertisements === "function",
    everyUnit: !!bt && typeof bt.requestLEScan === "function",
  };
}

function BluetoothDeviceProto(): { watchAdvertisements?: unknown } | undefined {
  const g = globalThis as unknown as { BluetoothDevice?: { prototype: { watchAdvertisements?: unknown } } };
  return g.BluetoothDevice?.prototype;
}

/** One advertisement of a WayTara unit heard by the radar. */
export interface Heard {
  id: string;
  name: string;
  rssi: number | null;
  /** the browser may connect to it without asking (it was allowed before) */
  device: BluetoothDeviceLike | null;
}

const isWayTara = (name: string | undefined): name is string => typeof name === "string" && name.startsWith("WayTara-");

/**
 * Starts listening for units, with no browser chooser: the units this browser was allowed to use before (getDevices + watchAdvertisements), and,
 * where the browser has the experimental scan, every WayTara unit in range. Calls `onHeard` for each advertisement. Returns what is actually
 * listened for and a way to stop. Nothing here needs a click, but a browser that can do neither returns a scan that hears nothing.
 */
export async function startRadar(onHeard: (h: Heard) => void): Promise<{ stop: () => void; listening: ScanCapabilities }> {
  const bt = bluetooth();
  const abort = new AbortController();
  const listening: ScanCapabilities = { remembered: false, everyUnit: false };
  const stops: (() => void)[] = [() => abort.abort()];
  if (!bt) return { stop: () => undefined, listening };

  const known = new Map<string, BluetoothDeviceLike>();
  if (typeof bt.getDevices === "function") {
    try {
      for (const d of await bt.getDevices()) {
        if (!isWayTara(d.name) || typeof d.watchAdvertisements !== "function") continue;
        const id = d.id ?? d.name;
        known.set(id, d);
        const onAd = (e: Event) => {
          const ev = e as AdvertisementEventLike;
          onHeard({ id, name: d.name!, rssi: typeof ev.rssi === "number" ? ev.rssi : null, device: d });
        };
        d.addEventListener("advertisementreceived", onAd);
        stops.push(() => d.removeEventListener("advertisementreceived", onAd));
        // the unit may be out of range now: that is not an error, it simply never appears
        void d.watchAdvertisements({ signal: abort.signal }).catch(() => undefined);
        listening.remembered = true;
      }
    } catch {
      /* the browser refuses to list its permissions: only the experimental scan, if any, is left */
    }
  }

  if (typeof bt.requestLEScan === "function") {
    try {
      const scan = await bt.requestLEScan({ filters: [{ services: [SERVICE_UUID] }], keepRepeatedDevices: true });
      const onAd = (e: Event) => {
        const ev = e as AdvertisementEventLike;
        const name = ev.device?.name ?? ev.name;
        if (!isWayTara(name)) return;
        const id = ev.device?.id ?? name;
        onHeard({ id, name, rssi: typeof ev.rssi === "number" ? ev.rssi : null, device: known.get(id) ?? null });
      };
      bt.addEventListener("advertisementreceived", onAd);
      stops.push(() => {
        bt.removeEventListener("advertisementreceived", onAd);
        scan.stop();
      });
      listening.everyUnit = true;
    } catch {
      /* needs a click or a permission the person has not given: the radar then listens for remembered units only */
    }
  }
  return { stop: () => stops.forEach((s) => s()), listening };
}

/** Opens a unit the browser already has permission for: no chooser. */
export async function openDevice(device: BluetoothDeviceLike): Promise<{ transport: Transport; name: string }> {
  if (!device.gatt) throw new Error("The unit offers no Bluetooth service.");
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const infoChar = await service.getCharacteristic(INFO_UUID);
  const rx = await service.getCharacteristic(RX_UUID);
  const tx = await service.getCharacteristic(TX_UUID);

  const frameHandlers: ((f: Uint8Array) => void)[] = [];
  const dropHandlers: (() => void)[] = [];
  tx.addEventListener("characteristicvaluechanged", () => {
    const v = tx.value;
    if (!v) return;
    const frame = new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
    for (const h of frameHandlers) h(frame);
  });
  device.addEventListener("gattserverdisconnected", () => {
    for (const h of dropHandlers) h();
  });
  await tx.startNotifications();

  const transport: Transport = {
    async readInfo() {
      const v = await infoChar.readValue();
      return JSON.parse(new TextDecoder().decode(v)) as UnitInfo;
    },
    async write(frame) {
      // with a response where the browser offers it: the unit sees each piece in order and the page knows it arrived
      if (rx.writeValueWithResponse) await rx.writeValueWithResponse(frame as unknown as BufferSource);
      else await rx.writeValue(frame as unknown as BufferSource);
    },
    onFrame: (h) => void frameHandlers.push(h),
    onDisconnect: (h) => void dropHandlers.push(h),
    disconnect: () => {
      if (server.connected) server.disconnect();
    },
  };
  return { transport, name: device.name ?? "WayTara unit" };
}

/**
 * Asks the browser to allow one unit (its own chooser, once per unit per browser: the browser never lets a page skip this) and returns it.
 * Given the unit's name the chooser lists only that unit. After this the unit is "remembered": the radar hears it and it opens with no chooser.
 */
export async function allowUnit(name?: string): Promise<BluetoothDeviceLike> {
  const bt = bluetooth();
  if (!bt) throw new Error("This browser cannot use Bluetooth.");
  try {
    return await bt.requestDevice(name ? { filters: [{ name }], optionalServices: [SERVICE_UUID] } : { filters: [{ services: [SERVICE_UUID] }] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") throw new BluetoothCancelled();
    throw e;
  }
}

/** Chooser, then connect (kept for a unit the radar cannot open by itself). */
export async function connectToUnit(preferName?: string): Promise<{ transport: Transport; name: string }> {
  return openDevice(await allowUnit(preferName));
}
