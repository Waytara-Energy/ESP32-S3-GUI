// Talks to the WayTara backend (the hub), signed in as the person using the page. Runs in the browser. The hub decides what this person may
// do; this code only carries the question and reports the answer in plain words.

export class GatewayApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayApiError";
    this.status = status;
  }
}

export interface GatewayClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

const plainMessage = (status: number): string =>
  status === 401
    ? "Please sign in again."
    : status === 404
      ? "You can't set up this device, or it no longer exists."
      : status === 409
        ? "That conflicts with the current state. Refresh the page and look again."
        : status === 429
          ? "Too many requests. Wait a minute and try again."
          : status >= 500
            ? "The service is unavailable right now. Try again in a moment."
            : "The request was not accepted.";

export interface BleGrant {
  grant: string;
  /** 1 view, 2 network, 3 service, 4 admin */
  level: number;
  level_name: "network" | "service" | "admin";
  expires_in: number;
}
export interface DecodedValue {
  key: string;
  label: string;
  unit: string | null;
  group: string | null;
  value: number | string;
  in_range: boolean;
}
export interface IntervalInfo {
  seconds: number;
  allowed: number[];
  default?: number;
  previous?: number;
}
export interface ReadRate {
  key: string;
  label: string;
  unit: string | null;
  category: string;
  /** the registers of the inverter this value is read from */
  registers: number[];
  /** the rate in force, in seconds */
  seconds: number;
  /** the rate the register map was made with */
  map_s: number;
  custom: boolean;
}
export interface ReadRates {
  allowed: number[];
  default: number;
  metrics: ReadRate[];
}
/** seconds = null puts back the register map's own rate */
export interface ReadRateChange {
  key: string;
  seconds: number | null;
}
export interface RotationInfo {
  state: string;
  rotation_id: string | null;
  started_at: string | null;
  expires_at: string | null;
  can_start: boolean;
  reason: string | null;
}

/** A charger added to a unit: its equipment, the name in its address, and whether WayTara is connected to it right now. */
export interface ChargerInfo {
  equipment_id: string;
  charge_point_id: string;
  label: string | null;
  connected: boolean;
  last_message_at: string | null;
}

export function createGatewayClient(o: GatewayClientOptions) {
  const base = o.baseUrl.replace(/\/+$/, "");
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const token = await o.getToken();
    if (!token) throw new GatewayApiError(401, plainMessage(401));
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });
    } catch {
      throw new GatewayApiError(0, "Could not reach the WayTara service from this page. Check your connection. A page opened from your own computer (localhost) is blocked by the service: use https://setup.waytaraenergy.com.");
    }
    if (!res.ok) {
      // the hub explains a refused request (a key change in progress, a wrong value) in plain words; use them when it does
      let said: string | null = null;
      if (res.status === 409 || res.status === 400) {
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          if (typeof j.error?.message === "string" && j.error.message.length < 300) said = j.error.message;
        } catch {
          /* no body */
        }
      }
      throw new GatewayApiError(res.status, said ?? plainMessage(res.status));
    }
    return (await res.json()) as T;
  }

  const eq = (id: string) => `/v1/equipment/${encodeURIComponent(id)}`;

  return {
    /** A single-use ticket (valid 15 minutes) that lets one board, named by its hardware id, collect the key of this equipment. */
    issueClaimTicket(equipmentId: string, hardwareId: string): Promise<{ ticket: string; expires_at: string }> {
      return call("POST", `${eq(equipmentId)}/claim-tickets`, { hardware_id: hardwareId });
    },
    /** The EV chargers added to this unit. */
    async chargers(gatewayId: string): Promise<ChargerInfo[]> {
      return (await call<{ chargers: ChargerInfo[] }>("GET", `/v1/ev/gateways/${encodeURIComponent(gatewayId)}/chargers`)).chargers;
    },
    /** Adds a charger to this unit (a new charger device at the unit's site), under the name in its address. */
    addCharger(gatewayId: string, body: { charge_point_id: string; label?: string }): Promise<{ equipment_id: string; charge_point_id: string; label: string | null }> {
      return call("POST", `/v1/ev/gateways/${encodeURIComponent(gatewayId)}/chargers`, body);
    },
    async removeCharger(gatewayId: string, chargePointId: string): Promise<boolean> {
      return (await call<{ removed: boolean }>("DELETE", `/v1/ev/gateways/${encodeURIComponent(gatewayId)}/chargers/${encodeURIComponent(chargePointId)}`)).removed;
    },
    /** A pass (two minutes) for this person to talk to this unit over Bluetooth, valid only on the connection whose public key is given. */
    bleGrant(equipmentId: string, unitPublicKey: string): Promise<BleGrant> {
      return call("POST", `${eq(equipmentId)}/ble-grant`, { pub: unitPublicKey });
    },
    /** Raw register blocks ([start, hex]) as values: the hub does all decoding. */
    async decode(equipmentId: string, blocks: [number, string][]): Promise<DecodedValue[]> {
      return (await call<{ values: DecodedValue[] }>("POST", `${eq(equipmentId)}/decode`, { blocks })).values;
    },
    getInterval(equipmentId: string): Promise<IntervalInfo> {
      return call("GET", `${eq(equipmentId)}/push-interval`);
    },
    setInterval(equipmentId: string, seconds: number): Promise<IntervalInfo> {
      return call("PUT", `${eq(equipmentId)}/push-interval`, { seconds });
    },
    getReadRates(equipmentId: string): Promise<ReadRates> {
      return call("GET", `${eq(equipmentId)}/read-rates`);
    },
    setReadRates(equipmentId: string, changes: ReadRateChange[]): Promise<{ changed: number }> {
      return call("PUT", `${eq(equipmentId)}/read-rates`, { changes });
    },
    rotationStatus(equipmentId: string): Promise<RotationInfo> {
      return call("GET", `${eq(equipmentId)}/rotation`);
    },
    startRotation(equipmentId: string): Promise<RotationInfo> {
      return call("POST", `${eq(equipmentId)}/rotation`, {});
    },
  };
}

export type GatewayClient = ReturnType<typeof createGatewayClient>;
