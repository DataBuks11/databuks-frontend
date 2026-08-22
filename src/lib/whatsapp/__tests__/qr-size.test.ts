import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  DEFAULT_QR_IMAGE_SIZE,
  MAX_QR_IMAGE_SIZE,
  MIN_QR_IMAGE_SIZE,
  resolveQrImageSize,
} from "@/lib/whatsapp/qr-size";

function pngDimensions(dataUrl: string): { width: number; height: number } {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const buf = Buffer.from(base64, "base64");
  // PNG signature (8 bytes) + IHDR chunk header (8 bytes) + width/height
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("resolveQrImageSize", () => {
  it("1. accepts a valid numeric size", () => {
    expect(resolveQrImageSize(512)).toBe(512);
    expect(resolveQrImageSize(MIN_QR_IMAGE_SIZE)).toBe(MIN_QR_IMAGE_SIZE);
    expect(resolveQrImageSize(MAX_QR_IMAGE_SIZE)).toBe(MAX_QR_IMAGE_SIZE);
  });

  it("2. undefined falls back to the project default", () => {
    expect(resolveQrImageSize(undefined)).toBe(DEFAULT_QR_IMAGE_SIZE);
  });

  it("3. NaN falls back to the project default (the production failure mode)", () => {
    expect(resolveQrImageSize(NaN)).toBe(DEFAULT_QR_IMAGE_SIZE);
  });

  it("4. numeric string sizes are coerced", () => {
    expect(resolveQrImageSize("512")).toBe(512);
    expect(resolveQrImageSize(" 256 ")).toBe(256);
  });

  it("5. invalid strings fall back to the default", () => {
    expect(resolveQrImageSize("abc")).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize("")).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize("300px")).toBe(DEFAULT_QR_IMAGE_SIZE);
  });

  it("out-of-range and non-finite values fall back to the default", () => {
    expect(resolveQrImageSize(0)).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize(-100)).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize(99999)).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize(Infinity)).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize(null)).toBe(DEFAULT_QR_IMAGE_SIZE);
    expect(resolveQrImageSize({ width: 300 })).toBe(DEFAULT_QR_IMAGE_SIZE);
  });

  it("6-8. QR generation succeeds with resolved sizes and renders valid PNG dimensions", async () => {
    for (const input of [undefined, NaN, "abc", DEFAULT_QR_IMAGE_SIZE]) {
      const size = resolveQrImageSize(input);
      expect(Number.isInteger(size)).toBe(true);

      const dataUrl = await QRCode.toDataURL("2@AbCsmoketestpayload", {
        width: size,
        margin: 2,
      });

      expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
      const dims = pngDimensions(dataUrl);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
      expect(Number.isNaN(dims.width)).toBe(false);
      expect(Number.isNaN(dims.height)).toBe(false);
    }
  });
});
