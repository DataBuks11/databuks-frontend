/**
 * Capability Registry Tests
 * Tests for platform capability detection, LinkedIn dynamic verification,
 * and capability status management.
 */
import { describe, it, expect } from "vitest";
import {
  getCapabilitiesForConnection,
  getWhatsAppCapabilities,
  capabilitySupports,
  ACTION_UNAVAILABLE_RESULT,
  DISCOVERY_UNAVAILABLE_RESULT,
} from "../../social/capabilities";

// ─── Instagram Capabilities ─────────────────────────────────────────────────

describe("Instagram capabilities", () => {
  it("returns full capabilities when connected", () => {
    const cap = getCapabilitiesForConnection({
      platform: "instagram",
      status: "connected",
      connection_id: "conn-123",
    });
    expect(cap.can_read_posts).toBe(true);
    expect(cap.can_publish).toBe(true);
    expect(cap.can_read_comments).toBe(true);
    expect(cap.can_reply_comments).toBe(true);
    expect(cap.can_read_messages).toBe(true);
    expect(cap.can_send_messages).toBe(true);
    expect(cap.can_read_media).toBe(true);
    expect(cap.can_search_discovery).toBe(false);
    expect(cap.capability_status).toBe("AVAILABLE");
  });

  it("returns SUPPORTED_BUT_NOT_CONNECTED when disconnected", () => {
    const cap = getCapabilitiesForConnection({
      platform: "instagram",
      status: "disconnected",
      connection_id: null,
    });
    expect(cap.capability_status).toBe("SUPPORTED_BUT_NOT_CONNECTED");
  });
});

// ─── Facebook Capabilities ──────────────────────────────────────────────────

describe("Facebook capabilities", () => {
  it("returns correct capabilities when connected", () => {
    const cap = getCapabilitiesForConnection({
      platform: "facebook",
      status: "connected",
      connection_id: "conn-456",
    });
    expect(cap.can_read_posts).toBe(true);
    expect(cap.can_read_comments).toBe(true);
    expect(cap.can_read_messages).toBe(false);
    expect(cap.can_send_messages).toBe(false);
    expect(cap.capability_status).toBe("AVAILABLE");
  });

  it("returns SUPPORTED_BUT_NOT_CONNECTED when not connected", () => {
    const cap = getCapabilitiesForConnection({
      platform: "facebook",
      status: "inactive",
      connection_id: null,
    });
    expect(cap.capability_status).toBe("SUPPORTED_BUT_NOT_CONNECTED");
  });
});

// ─── LinkedIn Capabilities ──────────────────────────────────────────────────

describe("LinkedIn capabilities", () => {
  it("returns all false when not connected", () => {
    const cap = getCapabilitiesForConnection({
      platform: "linkedin",
      status: "disconnected",
      connection_id: null,
    });
    expect(cap.can_read_posts).toBe(false);
    expect(cap.can_publish).toBe(false);
    expect(cap.can_read_comments).toBe(false);
    expect(cap.can_send_messages).toBe(false);
    expect(cap.can_search_discovery).toBe(false);
    expect(cap.capability_status).toBe("SUPPORTED_BUT_NOT_CONNECTED");
    expect(cap.permissions).toEqual([]);
  });

  it("returns SUPPORTED_BUT_NOT_VERIFIED when connected (before dynamic check)", () => {
    const cap = getCapabilitiesForConnection({
      platform: "linkedin",
      status: "connected",
      connection_id: "conn-789",
    });
    expect(cap.capability_status).toBe("SUPPORTED_BUT_NOT_VERIFIED");
    // Capabilities remain false until dynamic verification
    expect(cap.can_read_posts).toBe(false);
    expect(cap.can_publish).toBe(false);
  });
});

// ─── WhatsApp Capabilities ──────────────────────────────────────────────────

describe("WhatsApp capabilities", () => {
  it("returns messaging capabilities when connected", () => {
    const cap = getWhatsAppCapabilities(true, "+919999999999");
    expect(cap.can_read_messages).toBe(true);
    expect(cap.can_send_messages).toBe(true);
    expect(cap.can_read_posts).toBe(false);
    expect(cap.can_search_discovery).toBe(false);
    expect(cap.capability_status).toBe("AVAILABLE");
    expect(cap.account_id).toBe("+919999999999");
  });

  it("returns nothing when disconnected", () => {
    const cap = getWhatsAppCapabilities(false, null);
    expect(cap.can_read_messages).toBe(false);
    expect(cap.can_send_messages).toBe(false);
    expect(cap.capability_status).toBe("SUPPORTED_BUT_NOT_CONNECTED");
  });
});

// ─── capabilitySupports ─────────────────────────────────────────────────────

describe("capabilitySupports", () => {
  const igCap = getCapabilitiesForConnection({
    platform: "instagram",
    status: "connected",
    connection_id: "conn-1",
  });

  it("returns true for supported actions", () => {
    expect(capabilitySupports(igCap, "READ_POSTS")).toBe(true);
    expect(capabilitySupports(igCap, "COMMENT_REPLY")).toBe(true);
    expect(capabilitySupports(igCap, "READ_MEDIA")).toBe(true);
    expect(capabilitySupports(igCap, "PUBLISH")).toBe(true);
  });

  it("returns false for unsupported actions", () => {
    expect(capabilitySupports(igCap, "SEARCH_DISCOVERY")).toBe(false);
    expect(capabilitySupports(igCap, "FOLLOW")).toBe(false);
    expect(capabilitySupports(igCap, "UNKNOWN_ACTION")).toBe(false);
  });

  it("returns false for LinkedIn when not connected", () => {
    const liCap = getCapabilitiesForConnection({
      platform: "linkedin",
      status: "disconnected",
      connection_id: null,
    });
    expect(capabilitySupports(liCap, "READ_POSTS")).toBe(false);
    expect(capabilitySupports(liCap, "PUBLISH")).toBe(false);
    expect(capabilitySupports(liCap, "SEND_MESSAGE")).toBe(false);
    expect(capabilitySupports(liCap, "SEARCH_DISCOVERY")).toBe(false);
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe("ACTION_UNAVAILABLE_RESULT", () => {
  it("has correct structure", () => {
    expect(ACTION_UNAVAILABLE_RESULT.success).toBe(false);
    expect(ACTION_UNAVAILABLE_RESULT.errorCode).toBe("ACTION_UNAVAILABLE");
    expect(typeof ACTION_UNAVAILABLE_RESULT.errorMessage).toBe("string");
  });
});

describe("DISCOVERY_UNAVAILABLE_RESULT", () => {
  it("has correct structure", () => {
    expect(DISCOVERY_UNAVAILABLE_RESULT.success).toBe(false);
    expect(DISCOVERY_UNAVAILABLE_RESULT.errorCode).toBe("DISCOVERY_UNAVAILABLE");
    expect(typeof DISCOVERY_UNAVAILABLE_RESULT.errorMessage).toBe("string");
  });
});

// ─── Unknown platform ───────────────────────────────────────────────────────

describe("Unknown platform", () => {
  it("returns all false with UNAVAILABLE status", () => {
    const cap = getCapabilitiesForConnection({
      platform: "tiktok",
      status: "connected",
      connection_id: "conn-xxx",
    });
    expect(cap.can_read_posts).toBe(false);
    expect(cap.can_publish).toBe(false);
    expect(cap.can_search_discovery).toBe(false);
    expect(cap.capability_status).toBe("UNAVAILABLE");
  });
});
