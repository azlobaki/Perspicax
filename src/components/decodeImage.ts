import type { Pixels } from "@/lib/attachments/qr";

// QR codes stay readable well below this; larger images only cost memory.
const MAX_SIDE = 2000;

/**
 * Turns image bytes into pixels with the browser's own decoder, for QR
 * scanning. The bytes never leave the page: a Blob is not a request.
 */
export async function decodeImage(data: Uint8Array, contentType: string): Promise<Pixels | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data.slice()], { type: contentType }));
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { data: context.getImageData(0, 0, width, height).data, width, height };
  } catch {
    return null;
  }
}
