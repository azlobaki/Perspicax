import { unzlibSync } from "fflate";
import type { Pixels } from "../attachments/qr.ts";

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * A minimal PNG decoder for tests (8-bit, non-interlaced), standing in for
 * the browser's image decoder. Never imported by the app.
 */
export function decodePng(bytes: Uint8Array): Pixels {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Uint8Array[] = [];
  for (let pos = 8; pos < bytes.length; ) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      channels = CHANNELS[bytes[pos + 17]] ?? 0;
      if (bytes[pos + 16] !== 8 || bytes[pos + 20] !== 0 || channels === 0) throw new Error("test PNG decoder: 8-bit, non-interlaced, no palette");
    } else if (type === "IDAT") {
      parts.push(bytes.subarray(pos + 8, pos + 8 + length));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  const compressed = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((offset, p) => (compressed.set(p, offset), offset + p.length), 0);
  const raw = unzlibSync(compressed);
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const s = x * channels;
      const gray = channels < 3;
      out[i] = line[s];
      out[i + 1] = gray ? line[s] : line[s + 1];
      out[i + 2] = gray ? line[s] : line[s + 2];
      out[i + 3] = channels === 4 ? line[s + 3] : channels === 2 ? line[s + 1] : 255;
    }
    previous = line;
  }
  return { data: out, width, height };
}
