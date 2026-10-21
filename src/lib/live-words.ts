// The live readings arrive as pieces of rounds; the page keeps the newest word of every register it has seen and sends them to the server in
// as few blocks as possible (the server accepts up to 64 blocks of up to 125 registers each).

export const MAX_BLOCK_REGISTERS = 125;
export const MAX_BLOCKS = 64;

/** Consecutive registers joined into blocks of at most 125, in register order. `words` maps a register to its 4 hex digits. */
export function toBlocks(words: ReadonlyMap<number, string>): [number, string][] {
  const regs = [...words.keys()].sort((a, b) => a - b);
  const blocks: [number, string][] = [];
  let start = -1;
  let hex = "";
  let count = 0;
  for (const r of regs) {
    const next = start + count;
    if (start >= 0 && r === next && count < MAX_BLOCK_REGISTERS) {
      hex += words.get(r)!;
      count++;
    } else {
      if (start >= 0) blocks.push([start, hex]);
      start = r;
      hex = words.get(r)!;
      count = 1;
    }
  }
  if (start >= 0) blocks.push([start, hex]);
  return blocks.slice(0, MAX_BLOCKS);
}

/** Adds the words of a block ([start, hex]) to the register map of what was seen. Bad pieces are ignored. */
export function addBlock(words: Map<number, string>, start: number, hex: string): void {
  if (!/^(?:[0-9a-fA-F]{4})+$/.test(hex)) return;
  for (let i = 0; i * 4 < hex.length; i++) words.set(start + i, hex.slice(i * 4, i * 4 + 4).toLowerCase());
}
