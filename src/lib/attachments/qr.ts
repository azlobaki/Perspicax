import jsQR from "jsqr";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** The text of a QR code in an RGBA image, or null. jsqr is one of the local-only libraries the design allows. */
export function decodeQr(image: Pixels): string | null {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return result?.data ? result.data : null;
}
