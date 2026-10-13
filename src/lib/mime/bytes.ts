/**
 * MIME structure is ASCII but bodies are arbitrary bytes. The parser works on
 * "binary strings" — one char per byte, code points 0–255 — so it can use
 * plain string search and stay lossless.
 *
 * Never use `TextDecoder("latin1")` for this: per the WHATWG Encoding
 * standard that label means windows-1252, which remaps 0x80–0x9F.
 */
export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  // Chunked: spreading a large array into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

export function binaryToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

const BASE64_VALUES = (() => {
  const table = new Int8Array(256).fill(-1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  // URL-safe variants show up in hand-made payloads; accepting them costs nothing.
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

/**
 * Lenient base64: skips line breaks and stray characters, tolerates missing
 * padding, and realigns after `=` so concatenated encoded blocks still decode.
 */
export function decodeBase64(input: string): Uint8Array {
  const out = new Uint8Array(Math.ceil((input.length * 3) / 4));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x3d) {
      buffer = 0;
      bits = 0;
      continue;
    }
    const value = code < 256 ? BASE64_VALUES[code] : -1;
    if (value < 0) continue;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length++] = (buffer >> bits) & 0xff;
    }
  }
  return out.slice(0, length);
}

/** Quoted-printable (RFC 2045 §6.7). Malformed escapes are kept literally, as mail clients do. */
export function decodeQuotedPrintable(input: string): Uint8Array {
  const out = new Uint8Array(input.length);
  let length = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x3d) {
      // Soft line break: "=", optional trailing whitespace, then CRLF or LF.
      let j = i + 1;
      while (input[j] === " " || input[j] === "\t") j++;
      if (input[j] === "\r" && input[j + 1] === "\n") {
        i = j + 1;
        continue;
      }
      if (input[j] === "\n" || j >= input.length) {
        i = j;
        continue;
      }
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out[length++] = parseInt(hex, 16);
        i += 2;
        continue;
      }
    }
    out[length++] = code & 0xff;
  }
  return out.slice(0, length);
}
