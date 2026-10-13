const ALIASES: Record<string, string> = {
  utf8: "utf-8",
  "x-unknown": "utf-8",
  "unknown-8bit": "utf-8",
  "ks_c_5601-1987": "euc-kr",
  "ansi_x3.4-1968": "us-ascii",
};

// Labels that cannot be trusted to describe the bytes: they go through the
// UTF-8-then-legacy guess instead of a strict decoder.
const GUESSED = new Set(["utf-8", "us-ascii", "ascii"]);

function normaliseLabel(charset: string | null | undefined): string | null {
  const label = charset?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return label ? (ALIASES[label] ?? label) : null;
}

/**
 * Decodes text in its declared charset. A missing, unknown or untrustworthy
 * label falls back to UTF-8, then windows-1252 when the bytes are not valid
 * UTF-8: a wrong label should cost accents, not the whole body.
 */
export function decodeText(bytes: Uint8Array, charset?: string | null): string {
  const label = normaliseLabel(charset);
  if (label && !GUESSED.has(label)) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: guess below.
    }
  }
  return decodeUtf8OrLegacy(bytes);
}

export function decodeUtf8OrLegacy(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
