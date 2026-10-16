import { describe, expect, it } from "vitest";
import { DIR_FROM_UNIT, DIR_TO_UNIT, FLAG_HELLO, FLAG_LAST, FLAG_MIDDLE, Reassembler, concat, nonceFor, openRecord, sealRecord, toFrames, u64 } from "./protocol";
import { UnitError, UnitLink, type Transport, type UnitInfo } from "./unit-link";

import { fakeUnit } from "./fake-unit";

describe("the framing", () => {
  it("splits a record into pieces flagged middle / last and puts them back together", () => {
    const record = new Uint8Array(300).map((_, i) => i % 251);
    const frames = toFrames(record);
    expect(frames.map((f) => f[0])).toEqual([FLAG_MIDDLE, FLAG_MIDDLE, FLAG_LAST]);
    expect(frames.every((f) => f.length <= 121)).toBe(true);
    const r = new Reassembler();
    const out = frames.map((f) => r.push(f));
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toEqual(record);
  });

  it("refuses a record that never ends", () => {
    const r = new Reassembler(100);
    expect(() => {
      for (let i = 0; i < 5; i++) r.push(concat(new Uint8Array([FLAG_MIDDLE]), new Uint8Array(40)));
    }).toThrow(/too long/);
  });

  it("builds the nonce from the direction and the counter, as the firmware does", () => {
    expect(Array.from(nonceFor(1, 258n))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
  });
});

describe("the link to a unit", () => {
  it("agrees a key with a unit and talks to it in both directions, in pieces", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    const info = await link.connect();
    expect(info).toMatchObject({ hw: "2884855505D0", claimed: false });
    const nets = await link.scan();
    expect(nets.map((n) => n.s)).toEqual(["Home", "Guest", "Home", "Neighbour 5G"]);
    const joined = await link.join("Home", "a long password with spaces ".repeat(2).trim());
    expect(joined).toMatchObject({ connected: true, ssid: "Home" });
    expect(unit.seen.map((s) => s.c)).toEqual(["scan", "wifi"]);
    expect(unit.seen[1]!.args.pass).toBe("a long password with spaces a long password with spaces");
  });

  it("sends the claim ticket and returns what the unit was claimed as", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    await link.connect();
    expect(await link.claim("11111111-2222-4333-8444-555555555555")).toEqual({ equipment_id: "eq-1", key_id: "key-1" });
    expect(unit.seen[0]).toMatchObject({ c: "claim" });
  });

  it("turns a refusal by the unit into an error with the unit's reason", async () => {
    const unit = await fakeUnit({ answer: (c) => (c === "claim" ? { ok: false, why: "the ticket was not accepted" } : {}) });
    const link = new UnitLink(unit.transport);
    await link.connect();
    await expect(link.claim("x")).rejects.toMatchObject({ kind: "refused", message: "the ticket was not accepted" });
  });

  it("answers one request at a time, in order, when several are asked at once", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    await link.connect();
    const [a, b, c] = await Promise.all([link.scan(), link.state(), link.checks()]);
    expect(a).toHaveLength(4);
    expect(b.ssid).toBe("Home");
    expect(c.all_ok).toBe(true);
    expect(unit.seen.map((s) => s.c)).toEqual(["scan", "info", "checks"]);
  });

  it("times out when the unit does not answer, and then works again", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    await link.connect();
    unit.silence(1);
    await expect(link.request("scan", {}, 150)).rejects.toMatchObject({ kind: "timeout" });
    expect((await link.scan()).length).toBe(4);
  });

  it("fails every waiting request when the Bluetooth link drops, and tells the page", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    await link.connect();
    let closed = false;
    link.onClosed = () => (closed = true);
    unit.silence(1);
    const waiting = link.request("scan", {}, 5000);
    await new Promise((r) => setTimeout(r, 20));
    unit.dropLink();
    await expect(waiting).rejects.toBeInstanceOf(UnitError);
    expect(closed).toBe(true);
    await expect(link.scan()).rejects.toMatchObject({ kind: "link" });
  });

  it("ignores a record that does not authenticate and a repeated record", async () => {
    const unit = await fakeUnit();
    const link = new UnitLink(unit.transport);
    await link.connect();
    // a forged record: right framing, wrong key
    for (const f of toFrames(concat(u64(99n), new Uint8Array(40).fill(7)))) unit.push(f);
    await link.scan();
    // the unit's last answer sent again word for word (a replay)
    for (const f of unit.lastSent) unit.push(f);
    const again = unit.seen.length;
    expect((await link.state()).ssid).toBe("Home");
    expect(unit.seen.length).toBe(again + 1); // the replay did not make the page send or fail anything on its own
  });

  it("gives up with a clear message when the unit never completes the key exchange", async () => {
    const unit = await fakeUnit();
    const silent: Transport = { ...unit.transport, write: async () => undefined };
    const link = new UnitLink(silent);
    await expect(link.connect(100)).rejects.toMatchObject({ kind: "timeout" });
  });
});
