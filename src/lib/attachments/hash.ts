const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
// RFC 1321 defines its constants this way: floor(|sin(i + 1)| · 2^32).
const CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** MD5 (RFC 1321). WebCrypto does not offer it, and analysts still pivot on it. */
export function md5(data: Uint8Array): string {
  const blocks = Math.floor((data.length + 8) / 64) + 1;
  const buffer = new Uint8Array(blocks * 64);
  buffer.set(data);
  buffer[data.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(buffer.length - 8, (data.length * 8) >>> 0, true);
  view.setUint32(buffer.length - 4, Math.floor(data.length / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);
  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let j = 0; j < 16; j++) words[j] = view.getUint32(offset + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = d;
      d = c;
      c = b;
      const sum = (a + f + CONSTANTS[i] + words[g]) >>> 0;
      b = (b + ((sum << SHIFTS[i]) | (sum >>> (32 - SHIFTS[i])))) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((value, i) => out.setUint32(i * 4, value, true));
  return toHex(new Uint8Array(out.buffer));
}

export type Hashes = { md5: string; sha1: string; sha256: string };

export async function hashes(data: Uint8Array): Promise<Hashes> {
  // slice(): WebCrypto wants a plain ArrayBuffer-backed view.
  const digest = async (algorithm: string) => toHex(new Uint8Array(await crypto.subtle.digest(algorithm, data.slice())));
  const [sha1, sha256] = await Promise.all([digest("SHA-1"), digest("SHA-256")]);
  return { md5: md5(data), sha1, sha256 };
}
