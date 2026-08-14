import { describe, expect, it } from "vitest";
import { idempotencyKey } from "@/lib/ai/utils/idempotency";

describe("idempotency keys", () => {
  it("is deterministic for identical inputs", () => {
    expect(idempotencyKey("outreach", "user-1", "lead-1", "email", "hello")).toBe(
      idempotencyKey("outreach", "user-1", "lead-1", "email", "hello")
    );
  });

  it("differs when any part differs", () => {
    const a = idempotencyKey("outreach", "user-1", "lead-1", "email");
    const b = idempotencyKey("outreach", "user-1", "lead-2", "email");
    const c = idempotencyKey("meeting", "user-1", "lead-1", "email");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("drops empty parts", () => {
    expect(idempotencyKey("scope", null, undefined, "", "x")).toBe("scope:x");
  });

  it("is unique across different scopes", () => {
    expect(idempotencyKey("outreach", "x")).not.toBe(idempotencyKey("meeting", "x"));
  });
});
