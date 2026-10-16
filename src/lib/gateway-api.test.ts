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
