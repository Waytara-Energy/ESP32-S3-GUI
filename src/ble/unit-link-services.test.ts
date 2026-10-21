import { describe, expect, it } from "vitest";
import { fakeUnit } from "./fake-unit";
import { UnitLink, type LiveBlocks, type LogLine } from "./unit-link";

async function connect(level: number) {
  const unit = await fakeUnit({ level, claimedAs: "eq-1" });
  const link = new UnitLink(unit.transport);
  await link.connect();
  return { unit, link };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

describe("access levels on the link", () => {
  it("is refused everything but a ping until a grant is presented, then works at the grant's level", async () => {
    const { link } = await connect(0);
    await expect(link.state()).rejects.toMatchObject({ kind: "refused", message: expect.stringMatching(/sign in first/) });
    await link.ping();
    expect(await link.auth("grant-2")).toBe(2);
    expect((await link.state()).level).toBe(2);
    await expect(link.map("r")).rejects.toMatchObject({ kind: "refused", message: expect.stringMatching(/does not allow/) });
    await expect(link.status()).resolves.toMatchObject({ hub_link: true });
  });

  it("is told a grant is not valid, in the unit's words", async () => {
    const { link } = await connect(0);
    await expect(link.auth("nonsense")).rejects.toMatchObject({ kind: "refused", message: "the grant is not valid" });
  });

  it("reads the whole register map, page by page, in both lists", async () => {
    const unit = await fakeUnit({
      level: 3,
      answer: (c, a) => {
        if (c !== "map") return {};
        const from = Number(a.from ?? 0);
        const total = a.kind === "w" ? 5 : 3;
        const per = 2;
        const items = Array.from({ length: Math.min(per, total - from) }, (_, i) => [from + i, 1, 5]);
        return { ver: 7, kind: a.kind, total, from, items, ...(from + per < total ? { next: from + per } : {}) };
      },
    });
    const link = new UnitLink(unit.transport);
    await link.connect();
    const r = await link.fullMap("r");
    expect(r).toMatchObject({ ver: 7, total: 3 });
    expect(r.items.map((i) => i[0])).toEqual([0, 1, 2]);
    expect((await link.fullMap("w")).items).toHaveLength(5);
    expect(unit.seen.filter((s) => s.c === "map").map((s) => s.args.from)).toEqual([0, 2, 0, 2, 4]);
  });
});

describe("what the unit sends on its own", () => {
  it("passes on log lines once they are asked for", async () => {
    const { unit, link } = await connect(3);
    const got: LogLine[] = [];
    link.onLog = (l) => got.push(...l);
    await link.logs(true, 10);
    expect(unit.seen.at(-1)).toMatchObject({ c: "logs", args: { on: true, backlog: 10 } });
    await unit.sendJson({ log: [[5, "[100] ble    a phone connected"], [6, "[101] mqtt   up"]] });
    await tick();
    expect(got).toEqual([
      { n: 5, text: "[100] ble    a phone connected" },
      { n: 6, text: "[101] mqtt   up" },
    ]);
  });

  it("passes on the live readings, a round in pieces", async () => {
    const { unit, link } = await connect(1);
    const got: LiveBlocks[] = [];
    link.onLive = (p) => got.push(p);
    await link.live(true);
    await unit.sendJson({ live: 12, t: 1792044000000, b: [[186, "0064"]], more: true });
    await unit.sendJson({ live: 12, t: 1792044000000, b: [[190, "ffc4"]], more: false });
    await tick();
    expect(got.map((g) => [g.round, g.more, g.blocks[0]![0]])).toEqual([
      [12, true, 186],
      [12, false, 190],
    ]);
  });

  it("does not mistake a stream record for the answer to a request", async () => {
    const { unit, link } = await connect(3);
    const answer = link.status();
    await unit.sendJson({ log: [[1, "x"]] });
    await expect(answer).resolves.toMatchObject({ hub_link: true });
  });
});
