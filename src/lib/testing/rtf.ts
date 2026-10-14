import { rtfCrc32 } from "../msg/rtf.ts";

const PREBUF_LENGTH = 207;

/**
 * Compresses RTF the way Outlook stores it, using literals only — valid, if
 * not small. Builds test messages; never imported by the app.
 */
export function compressRtf(rtf: string): Uint8Array {
  const raw = new Uint8Array([...rtf].map((ch) => ch.charCodeAt(0) & 0xff));
  const body: number[] = [];
  let write = PREBUF_LENGTH;
  for (let i = 0; ; i += 8) {
    const chunk = raw.subarray(i, i + 8);
    if (chunk.length === 8) {
      body.push(0, ...chunk);
      write = (write + 8) % 4096;
      continue;
    }
    // The last run: its literals, then a reference to the write position, which ends the stream.
    write = (write + chunk.length) % 4096;
    body.push(1 << chunk.length, ...chunk, write >> 4, (write & 0xf) << 4);
    break;
  }
  const data = new Uint8Array(body);
  const header = new DataView(new ArrayBuffer(16));
  header.setUint32(0, data.length + 12, true);
  header.setUint32(4, raw.length, true);
  header.setUint32(8, 0x75465a4c, true);
  header.setUint32(12, rtfCrc32(data), true);
  return new Uint8Array([...new Uint8Array(header.buffer), ...data]);
}
