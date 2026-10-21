import { describe, expect, it } from "vitest";
import { GatewayApiError, createGatewayClient } from "./gateway-api";

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { calls, client: createGatewayClient({ baseUrl: "https://hub.example/", getToken: async () => "tok", fetch }) };
}

describe("gateway client", () => {
  it("asks for a claim ticket for one board of one equipment, with the signed-in token", async () => {
    const { calls, client } = fake(201, { ticket: "t", expires_at: "2026-10-16T00:00:00Z" });
    expect(await client.issueClaimTicket("00000000-0000-4000-8000-000000000001", "2884855505D0")).toMatchObject({ ticket: "t" });
    expect(calls[0]!.url).toBe("https://hub.example/v1/equipment/00000000-0000-4000-8000-000000000001/claim-tickets");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ hardware_id: "2884855505D0" });
  });

  it("does not call out without a sign-in", async () => {
    const none = createGatewayClient({ baseUrl: "https://x", getToken: async () => null, fetch: (() => { throw new Error("no call expected"); }) as unknown as typeof fetch });
    await expect(none.issueClaimTicket("e", "h")).rejects.toMatchObject({ status: 401 });
  });

  it("gives plain messages for refusals and for an unreachable service", async () => {
    await expect(fake(404, {}).client.issueClaimTicket("e", "h")).rejects.toThrow(/can't set up this device/);
    await expect(fake(409, {}).client.issueClaimTicket("e", "h")).rejects.toBeInstanceOf(GatewayApiError);
    await expect(fake(429, {}).client.issueClaimTicket("e", "h")).rejects.toThrow(/Too many requests/);
    await expect(fake(503, {}).client.issueClaimTicket("e", "h")).rejects.toThrow(/unavailable/);
    const down = createGatewayClient({ baseUrl: "https://x", getToken: async () => "t", fetch: (async () => { throw new TypeError("network"); }) as unknown as typeof fetch });
    await expect(down.issueClaimTicket("e", "h")).rejects.toMatchObject({ status: 0 });
  });
});

describe("gateway client: the setup page's other calls", () => {
  it("asks for a Bluetooth grant with the unit's public key", async () => {
    const { calls, client } = fake(200, { grant: "g", level: 3, level_name: "service", expires_in: 120 });
    expect(await client.bleGrant("e1", "KEY")).toMatchObject({ grant: "g", level: 3 });
    expect(calls[0]!.url).toBe("https://hub.example/v1/equipment/e1/ble-grant");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ pub: "KEY" });
  });

  it("sends raw blocks to be decoded and returns the values", async () => {
    const { calls, client } = fake(200, { values: [{ key: "pv1_power_w", label: "PV1 power", unit: "W", group: "Solar", value: 100, in_range: true }] });
    expect((await client.decode("e1", [[186, "0064"]]))[0]).toMatchObject({ key: "pv1_power_w", value: 100 });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ blocks: [[186, "0064"]] });
  });

  it("reads and changes the push interval, and reads and starts a key change", async () => {
    const a = fake(200, { seconds: 900, allowed: [60, 900] });
    expect((await a.client.getInterval("e1")).seconds).toBe(900);
    expect(a.calls[0]!.init.method).toBe("GET");
    expect(a.calls[0]!.init.body).toBeUndefined();
    const b = fake(200, { seconds: 300, allowed: [300], previous: 900 });
    await b.client.setInterval("e1", 300);
    expect(b.calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(b.calls[0]!.init.body as string)).toEqual({ seconds: 300 });
    const c = fake(200, { state: "idle", rotation_id: null, started_at: null, expires_at: null, can_start: true, reason: null });
    expect((await c.client.rotationStatus("e1")).can_start).toBe(true);
    await c.client.startRotation("e1");
    expect(c.calls[1]!.url).toBe("https://hub.example/v1/equipment/e1/rotation");
  });

  it("reads the read rates and sends changes (null puts back the map's rate)", async () => {
    const a = fake(200, { allowed: [10, 30], default: 30, metrics: [] });
    expect((await a.client.getReadRates("e1")).default).toBe(30);
    expect(a.calls[0]!.url).toBe("https://hub.example/v1/equipment/e1/read-rates");
    expect(a.calls[0]!.init.method).toBe("GET");
    const b = fake(200, { changed: 2 });
    expect((await b.client.setReadRates("e1", [{ key: "pv1_power_w", seconds: 10 }, { key: "battery_temp_c", seconds: null }])).changed).toBe(2);
    expect(b.calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(b.calls[0]!.init.body as string)).toEqual({ changes: [{ key: "pv1_power_w", seconds: 10 }, { key: "battery_temp_c", seconds: null }] });
  });

  it("repeats the hub's own plain words for a refused request", async () => {
    const { client } = fake(409, { error: { code: "key_change_in_progress", message: "The unit is changing its key right now. Try again in a few minutes." } });
    await expect(client.bleGrant("e1", "K")).rejects.toThrow(/changing its key right now/);
    await expect(fake(404, { error: { message: "secret detail" } }).client.bleGrant("e1", "K")).rejects.toThrow(/can't set up this device/);
  });
});
