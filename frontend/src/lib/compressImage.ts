const MAX_BYTES = 4_500_000;
const MAX_DIM = 2560;
const JPEG_QUALITY = 0.8;

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Telegram-style compression: cap longest edge at 2560 px,
 * re-encode as JPEG @ 80 % quality. Only processes images above
 * the byte threshold; PDFs and small images pass through unchanged.
 */
export async function maybeCompressImage(file: File): Promise<File> {
  if (!isImage(file) || file.size <= MAX_BYTES) return file;

  const bitmap = await createImageBitmap(file);

  let w = bitmap.width;
  let h = bitmap.height;

  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  } else {
    const scale = Math.sqrt(MAX_BYTES / file.size);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  const name = file.name.replace(/\.[^.]+$/, ".jpg");
  return new File([blob], name, { type: "image/jpeg" });
}
