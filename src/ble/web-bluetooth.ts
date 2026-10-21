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
interface BluetoothDeviceLike extends EventTarget {
  name?: string;
  gatt?: GattServer;
}
interface BluetoothLike {
  requestDevice(options: { filters: ({ services: string[] } | { name: string })[]; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
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

/** Asks the person to choose a unit that is advertising the WayTara setup service, and connects to it. */
export async function connectToUnit(preferName?: string): Promise<{ transport: Transport; name: string }> {
  const bt = bluetooth();
  if (!bt) throw new Error("This browser cannot use Bluetooth.");
  let device: BluetoothDeviceLike;
  try {
    // a remembered unit is asked for by name, so the browser's list shows only that one; otherwise every WayTara unit in range is listed
    device = await bt.requestDevice(preferName ? { filters: [{ name: preferName }], optionalServices: [SERVICE_UUID] } : { filters: [{ services: [SERVICE_UUID] }] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") throw new BluetoothCancelled();
    throw e;
  }
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
