/** Práce s fotkami bodů: komprese před uploadem a čtení do data URL. */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/** Zmenší a zkomprimuje snímek na rozumnou velikost pro sync (~1–2 MB → stovky kB). */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob ?? file;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Čtení souboru selhalo."));
    reader.readAsDataURL(blob);
  });
}

/** Fotka uložená přímo v projektu (lokální režim) vs. cesta ve Storage (cloud). */
export function isInlinePhoto(ref: string): boolean {
  return ref.startsWith("data:") || ref.startsWith("blob:") || ref.startsWith("http");
}
