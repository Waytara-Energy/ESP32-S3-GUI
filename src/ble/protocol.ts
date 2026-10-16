// The encrypted Bluetooth link to a WayTara unit (firmware: waytara-gateway-fw/ble_setup.cpp, plan 8.4). Pure functions on bytes, so they
// are tested without a Bluetooth radio.
//
// Key agreement: both sides make a P-256 key pair, derive a secret (ECDH), and from it an AES-256-GCM key with HKDF-SHA-256, salted with
// the unit's public key followed by the page's. A record is counter(8, big endian) + ciphertext + tag(16). The nonce is one direction
// byte (0 page to unit, 1 unit to page), three zero bytes and the counter; the additional data is "wt-ble/v1". A record is sent in pieces:
// one flag byte (0x00 = a middle piece, 0x01 = the last) and up to 120 bytes of the record. The page's public key goes first as a single
// plain frame with the flag 0xA0.

export const SERVICE_UUID = "6f0f0001-b6f5-4b3a-9a52-77a7e7a0a001";
export const INFO_UUID = "6f0f0002-b6f5-4b3a-9a52-77a7e7a0a001";
export const RX_UUID = "6f0f0003-b6f5-4b3a-9a52-77a7e7a0a001";
export const TX_UUID = "6f0f0004-b6f5-4b3a-9a52-77a7e7a0a001";

export const FLAG_HELLO = 0xa0;
export const FLAG_MIDDLE = 0x00;
export const FLAG_LAST = 0x01;
export const PIECE_BYTES = 120;
export const DIR_TO_UNIT = 0;
export const DIR_FROM_UNIT = 1;

const AAD = new TextEncoder().encode("wt-ble/v1");
const HKDF_INFO = new TextEncoder().encode("waytara/v1/ble");

/** Web Crypto wants a plain ArrayBuffer-backed view; this keeps TypeScript content with byte arrays that came from slices. */
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export function b64uDecode(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function u64(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n);
  return out;
}

export const nonceFor = (direction: number, counter: bigint): Uint8Array => concat(new Uint8Array([direction, 0, 0, 0]), u64(counter));

export interface LinkKeys {
  /** the page's public key (65 bytes), sent to the unit first */
  hello: Uint8Array;
  key: CryptoKey;
}

/** Makes a fresh key pair and the shared key for a unit whose public key was read from its info characteristic. */
export async function agreeKey(unitPublicKeyB64u: string): Promise<LinkKeys> {
  const unitPub = b64uDecode(unitPublicKeyB64u);
  if (unitPub.length !== 65 || unitPub[0] !== 0x04) throw new Error("the unit's public key is not valid");
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const hello = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const unitKey = await crypto.subtle.importKey("raw", buf(unitPub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: unitKey }, pair.privateKey, 256);
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buf(concat(unitPub, hello)), info: buf(HKDF_INFO) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { hello, key };
}

/** counter + ciphertext + tag */
export async function sealRecord(key: CryptoKey, direction: number, counter: bigint, plain: Uint8Array): Promise<Uint8Array> {
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonceFor(direction, counter)), additionalData: buf(AAD) }, key, buf(plain)));
  return concat(u64(counter), ct);
}

/** Throws if the record does not authenticate. */
export async function openRecord(key: CryptoKey, direction: number, record: Uint8Array): Promise<{ counter: bigint; plain: Uint8Array }> {
  if (record.length < 8 + 16) throw new Error("the record is too short");
  const counter = new DataView(record.buffer, record.byteOffset, record.byteLength).getBigUint64(0);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(nonceFor(direction, counter)), additionalData: buf(AAD) }, key, buf(record.slice(8))));
  return { counter, plain };
}

/** A record as the frames to write, in order. */
export function toFrames(record: Uint8Array, piece = PIECE_BYTES): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let i = 0; i < record.length; i += piece) {
    const last = i + piece >= record.length;
    frames.push(concat(new Uint8Array([last ? FLAG_LAST : FLAG_MIDDLE]), record.slice(i, i + piece)));
  }
  return frames;
}

/** Puts the pieces of a record back together. `push` returns the record when its last piece arrives. */
export class Reassembler {
  private parts: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly maxBytes = 4096) {}

  push(frame: Uint8Array): Uint8Array | null {
    if (frame.length < 1) return null;
    const piece = frame.slice(1);
    this.size += piece.length;
    if (this.size > this.maxBytes) {
      this.reset();
      throw new Error("a record from the unit was too long");
    }
    this.parts.push(piece);
    if (frame[0] !== FLAG_LAST) return null;
    const record = concat(...this.parts);
    this.reset();
    return record;
  }

  reset(): void {
    this.parts = [];
    this.size = 0;
  }
}
