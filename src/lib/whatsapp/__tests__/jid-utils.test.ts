import { describe, expect, it } from "vitest";
import { phoneToJid } from "@/lib/whatsapp/jid-utils";

describe("phoneToJid", () => {
  it("builds WA JID from Indian number", () => {
    expect(phoneToJid("+91 87886 06608")).toBe("918788606608@s.whatsapp.net");
  });

  it("strips device suffixes and formatting", () => {
    // device-suffixed JID -> clean base
    expect(phoneToJid("918788606608.0:64@s.whatsapp.net")).toBe("918788606608@s.whatsapp.net");
    expect(phoneToJid("918788606608.0:64")).toBe("918788606608@s.whatsapp.net");
    // spaced/dashed number = 10 digits, kept as-is
    expect(phoneToJid("87886-06608")).toBe("8788606608@s.whatsapp.net");
  });

  it("rejects too-short values", () => {
    expect(phoneToJid("12345")).toBeNull();
    expect(phoneToJid("")).toBeNull();
    expect(phoneToJid(null)).toBeNull();
    expect(phoneToJid(undefined)).toBeNull();
  });
});