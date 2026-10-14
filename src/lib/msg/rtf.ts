import { decodeText } from "../mime/charset.ts";

/**
 * Outlook often stores a message's formatted body only as compressed RTF
 * ([MS-OXRTFCP]). When the message arrived as HTML, that RTF still carries
 * the original HTML ([MS-OXRTFEX]), which is what the link and HTML checks
 * need. Both formats are undone here; nothing in the RTF is ever rendered.
 */

const COMPRESSED = 0x75465a4c; // "LZFu"
const UNCOMPRESSED = 0x414c454d; // "MELA"

// The dictionary every compressed stream starts from ([MS-OXRTFCP] 2.1.2.1).
const PREBUF =
  "{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier" +
  "{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The format's CRC-32: the usual table, but no initial or final inversion. */
export function rtfCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

/**
 * Undoes Outlook's RTF compression. A wrong checksum is reported rather than
 * fatal: a body edited in place (by a redaction tool, say) still decompresses.
 */
export function decompressRtf(bytes: Uint8Array): { data: Uint8Array; crcOk: boolean } {
  if (bytes.length < 16) throw new Error("Compressed RTF is too short.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawSize = view.getUint32(4, true);
  const type = view.getUint32(8, true);
  const crc = view.getUint32(12, true);
  const end = Math.min(bytes.length, 4 + view.getUint32(0, true));
  if (type === UNCOMPRESSED) return { data: bytes.slice(16, 16 + rawSize), crcOk: true };
  if (type !== COMPRESSED) throw new Error("This is not compressed RTF.");

  const input = bytes.subarray(16, end);
  const dict = new Uint8Array(4096);
  for (let i = 0; i < PREBUF.length; i++) dict[i] = PREBUF.charCodeAt(i);
  let write = PREBUF.length;
  // Sized from the header, which may lie: grown on demand instead of trusted.
  let out = new Uint8Array(Math.min(rawSize, 64 * 1024 * 1024) || 1024);
  let length = 0;
  const push = (byte: number) => {
    if (length === out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[length++] = byte;
    dict[write] = byte;
    write = (write + 1) % 4096;
  };

  let pos = 0;
  decode: while (pos < input.length) {
    const control = input[pos++];
    for (let bit = 0; bit < 8 && pos < input.length; bit++) {
      if ((control & (1 << bit)) === 0) {
        push(input[pos++]);
        continue;
      }
      if (pos + 1 >= input.length) break decode;
      const word = (input[pos] << 8) | input[pos + 1];
      pos += 2;
      const offset = word >> 4;
      // A reference to the write position itself marks the end.
      if (offset === write) break decode;
      const count = (word & 0xf) + 2;
      for (let i = 0; i < count; i++) push(dict[(offset + i) % 4096]);
    }
  }
  return { data: out.slice(0, Math.min(length, rawSize || length)), crcOk: rtfCrc32(input) === crc };
}

/** What the RTF body was made from: an HTML message, a plain-text one, or RTF written in Outlook. */
export function rtfOrigin(rtf: string): "html" | "text" | "rtf" {
  const head = rtf.slice(0, 2048);
  if (/\\fromhtml1(?![a-z0-9])/i.test(head)) return "html";
  if (/\\fromtext(?![a-z])/i.test(head)) return "text";
  return "rtf";
}

// Destinations whose content is never part of the HTML.
const SKIPPED = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "listtable", "listoverridetable",
  "rsidtbl", "generator", "xmlnstbl", "latentstyles", "datastore", "themedata", "colorschememapping",
  "header", "footer", "footnote", "fldinst", "filetbl", "revtbl", "pgdsctbl",
]);

const SYMBOLS: Record<string, string> = {
  par: "\r\n", line: "\r\n", tab: "\t", emdash: "—", endash: "–", emspace: " ", enspace: " ",
  lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", bullet: "•",
};

function codePage(cpg: number): string {
  if (cpg === 65001) return "utf-8";
  if (cpg >= 1250 && cpg <= 1258) return `windows-${cpg}`;
  if (cpg >= 28591 && cpg <= 28605) return `iso-8859-${cpg - 28590}`;
  return { 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 20866: "koi8-r" }[cpg] ?? "windows-1252";
}

type State = { suppressed: boolean; skipped: boolean; tag: boolean; uc: number };

/**
 * The HTML an RTF body was converted from, or null when it was not converted
 * from HTML. `rtf` is the decompressed RTF read as Latin-1, one char per byte.
 */
export function htmlFromRtf(rtf: string): string | null {
  if (rtfOrigin(rtf) !== "html") return null;
  let charset = "windows-1252";
  const out: string[] = [];
  let bytes: number[] = [];
  const flush = () => {
    if (bytes.length === 0) return;
    out.push(decodeText(new Uint8Array(bytes), charset));
    bytes = [];
  };

  let state: State = { suppressed: false, skipped: false, tag: false, uc: 1 };
  const stack: State[] = [];
  // Fallback characters still to drop after a \u escape.
  let skip = 0;
  const emitting = () => !state.skipped && (state.tag || !state.suppressed);
  const emitText = (text: string) => {
    if (skip > 0) {
      skip--;
      return;
    }
    if (!emitting()) return;
    flush();
    out.push(text);
  };
  const emitByte = (byte: number) => {
    if (skip > 0) {
      skip--;
      return;
    }
    if (emitting()) bytes.push(byte);
  };

  let i = 0;
  // Set right after "{": the first control word decides what the group is.
  let groupStart = false;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      stack.push(state);
      state = { ...state };
      groupStart = true;
      i++;
      continue;
    }
    if (ch === "}") {
      state = stack.pop() ?? state;
      groupStart = false;
      skip = 0;
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    if (ch !== "\\") {
      groupStart = false;
      emitText(ch);
      i++;
      continue;
    }

    const next = rtf[i + 1] ?? "";
    if (next === "*") {
      // An optional destination: kept only if it is an HTML tag.
      const word = /^\\\*\s*\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 64));
      if (word && groupStart && word[1].toLowerCase() === "htmltag") {
        state.tag = true;
        state.skipped = false;
      } else {
        state.skipped = true;
      }
      groupStart = false;
      i += word ? word[0].length : 2;
      continue;
    }
    if (next === "'") {
      groupStart = false;
      emitByte(parseInt(rtf.slice(i + 2, i + 4), 16) || 0);
      i += 4;
      continue;
    }
    if (!/[a-z]/i.test(next)) {
      // A control symbol: \\ \{ \} and a few special characters.
      groupStart = false;
      i += 2;
      if (next === "\\" || next === "{" || next === "}") emitText(next);
      else if (next === "~") emitText(" ");
      else if (next === "_") emitText("-");
      continue;
    }

    const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 48));
    if (!match) {
      i++;
      continue;
    }
    i += match[0].length;
    const word = match[1].toLowerCase();
    const param = match[2] === undefined ? null : Number(match[2]);
    const first = groupStart;
    groupStart = false;

    if (word === "bin") {
      // Raw bytes, never text: the space after the parameter is already consumed.
      i += Math.max(0, param ?? 0);
      continue;
    }
    if (first && SKIPPED.has(word)) {
      state.skipped = true;
      continue;
    }
    switch (word) {
      case "htmlrtf":
        state.suppressed = param !== 0;
        break;
      case "ansicpg":
        if (param !== null) charset = codePage(param);
        break;
      case "uc":
        state.uc = Math.max(0, param ?? 1);
        break;
      case "u":
        if (param !== null) {
          emitText(String.fromCharCode(param < 0 ? param + 65536 : param));
          skip = state.uc;
        }
        break;
      default:
        if (word in SYMBOLS) emitText(SYMBOLS[word]);
    }
  }
  flush();
  return out.join("");
}
