/**
 * QR image sizing rules shared by the WhatsApp connect flow.
 *
 * Root cause context: a NaN/invalid dimension reaching the PNG encoder
 * surfaces as Node's `RangeError: The value of "size" is out of range.
 * It must be >= 0 && <= 4294967296. Received NaN`. Every numeric input
 * that influences QR image dimensions must pass through this resolver
 * so it can never reach the encoder invalid.
 */

export const DEFAULT_QR_IMAGE_SIZE = 300;
export const MIN_QR_IMAGE_SIZE = 64;
export const MAX_QR_IMAGE_SIZE = 1024;

export function resolveQrImageSize(raw: unknown): number {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    value = Number(raw.trim());
  } else {
    return DEFAULT_QR_IMAGE_SIZE;
  }

  if (!Number.isFinite(value)) return DEFAULT_QR_IMAGE_SIZE;

  const floored = Math.floor(value);
  if (floored < MIN_QR_IMAGE_SIZE || floored > MAX_QR_IMAGE_SIZE) {
    return DEFAULT_QR_IMAGE_SIZE;
  }
  return floored;
}
