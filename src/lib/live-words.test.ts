import { describe, expect, it } from "vitest";
import { MAX_BLOCKS, addBlock, toBlocks } from "./live-words";

describe("the live words", () => {
  it("keeps the newest word of each register and joins neighbours into one block", () => {
    const w = new Map<number, string>();
    addBlock(w, 186, "0064" + "00c8");
    addBlock(w, 190, "ffc4");
    addBlock(w, 186, "0065"); // newer reading of register 186
    expect(toBlocks(w)).toEqual([
      [186, "006500c8"],
      [190, "ffc4"],
    ]);
  });

  it("splits a long run at 125 registers", () => {
    const w = new Map<number, string>();
    addBlock(w, 100, "0001".repeat(130));
    const blocks = toBlocks(w);
    expect(blocks.map(([s, h]) => [s, h.length / 4])).toEqual([
      [100, 125],
      [225, 5],
    ]);
  });

  it("never sends more blocks than the server takes, and ignores damaged pieces", () => {
    const w = new Map<number, string>();
    for (let i = 0; i < 200; i++) addBlock(w, i * 2, "0001");
    expect(toBlocks(w)).toHaveLength(MAX_BLOCKS);
    const v = new Map<number, string>();
    addBlock(v, 5, "zz11");
    addBlock(v, 6, "001");
    expect(toBlocks(v)).toEqual([]);
  });
});
