import { inflateSync } from "fflate";
import { decodeUtf8OrLegacy } from "../mime/charset.ts";

export type ZipEntry = {
  name: string;
  size: number;
  compressedSize: number;
  /** 0 = stored, 8 = deflate. */
  method: number;
  encrypted: boolean;
  /** Offset of the entry's local header. */
  offset: number;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const MAX_ENTRY_SIZE = 20_000_000;

/** Entries from the central directory, without decompressing anything. Null if this is not a ZIP. */
export function listZip(data: Uint8Array): ZipEntry[] | null {
  if (data.length < 22) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65_557); i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > data.length || view.getUint32(p, true) !== CENTRAL_HEADER) break;
    const flags = view.getUint16(p + 8, true);
    const nameLength = view.getUint16(p + 28, true);
    const nameBytes = data.subarray(p + 46, p + 46 + nameLength);
    entries.push({
      // Bit 11 marks UTF-8 names; older tools write the OEM code page.
      name: flags & 0x800 ? new TextDecoder().decode(nameBytes) : decodeUtf8OrLegacy(nameBytes),
      size: view.getUint32(p + 24, true),
      compressedSize: view.getUint32(p + 20, true),
      method: view.getUint16(p + 10, true),
      encrypted: (flags & 1) === 1,
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return entries.length > 0 || count === 0 ? entries : null;
}

/** The entry's content, or null when it is encrypted, too large, damaged or uses another method. */
export function readZipEntry(data: Uint8Array, entry: ZipEntry): Uint8Array | null {
  if (entry.encrypted || entry.size > MAX_ENTRY_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const p = entry.offset;
  if (p + 30 > data.length || view.getUint32(p, true) !== LOCAL_HEADER) return null;
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const raw = data.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method !== 8) return null;
  if (entry.size === 0) return new Uint8Array(0);
  try {
    return inflateSync(raw, { out: new Uint8Array(entry.size) });
  } catch {
    return null;
  }
}
