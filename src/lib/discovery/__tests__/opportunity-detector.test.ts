import { describe, expect, it } from "vitest";
import { detectOpportunities, primaryOpportunity } from "../opportunity-detector";

const base = {
  businessName: "Sharma Restaurant",
  categoryHint: "restaurant",
  fullText: "Sharma Restaurant family dining butter chicken. Call us on 0712-123456 for table. Walk-ins welcome.",
  websiteUrl: "https://sharma-restaurant.example.com",
  websiteReachable: true,
  pageTextLength: 2500,
  hasPhone: true,
  hasEmail: false,
  hasWhatsAppSignal: false,
  hasInstagram: true,
  hasFacebook: false,
};

describe("opportunity detector", () => {
  it("flags WEBSITE_GAP HIGH when no website exists (with evidence, no invented claims)", () => {
    const out = detectOpportunities({ ...base, websiteUrl: null, websiteReachable: false });
    expect(out[0].type).toBe("WEBSITE_GAP");
    expect(out[0].strength).toBe("HIGH");
    expect(out[0].evidence.length).toBeGreaterThan(0);
    // No on-site gaps without a site
    expect(out.some((o) => o.type === "LEAD_CAPTURE_GAP")).toBe(false);
  });

  it("flags BOOKING_GAP for restaurant without booking signal", () => {
    const out = detectOpportunities(base);
    const types = out.map((o) => o.type);
    expect(types).toContain("BOOKING_GAP");
    const b = out.find((o) => o.type === "BOOKING_GAP")!;
    expect(b.evidence[0]).toMatch(/restaurant/);
  });

  it("flags WHATSAPP_GAP when phone public but no WhatsApp observed", () => {
    const out = detectOpportunities(base);
    expect(out.some((o) => o.type === "WHATSAPP_GAP")).toBe(true);
  });

  it("does NOT flag WHATSAPP_GAP when wa.me link observed", () => {
    const out = detectOpportunities({
      ...base,
      fullText: base.fullText + " chat on wa.me/919876543210",
    });
    expect(out.some((o) => o.type === "WHATSAPP_GAP")).toBe(false);
  });

  it("flags LEAD_CAPTURE_GAP when site has no enquiry path", () => {
    const out = detectOpportunities({
      ...base,
      fullText: "Welcome to our hotel. Rooms from Rs 2000. Located near station.",
    });
    expect(out.some((o) => o.type === "LEAD_CAPTURE_GAP")).toBe(true);
  });

  it("does NOT flag LEAD_CAPTURE_GAP when contact form exists", () => {
    const out = detectOpportunities({
      ...base,
      fullText: "Fill our contact form and we will call back. Get a quote today.",
    });
    expect(out.some((o) => o.type === "LEAD_CAPTURE_GAP")).toBe(false);
  });

  it("flags CUSTOM_SOFTWARE_OPPORTUNITY for manual-quote manufacturer", () => {
    const out = detectOpportunities({
      ...base,
      businessName: "Nagpur Alloys Pvt Ltd",
      categoryHint: "manufacturing",
      fullText: "Steel manufacturer Nagpur MIDC. Call for price quotation. Bulk orders on phone.",
    });
    expect(out.some((o) => o.type === "CUSTOM_SOFTWARE_OPPORTUNITY")).toBe(true);
  });

  it("never invents: rich site with all signals yields few/no claims", () => {
    const out = detectOpportunities({
      ...base,
      fullText:
        "Book online now. Fill contact form for callback. Chat on wa.me/911234567890. Subscribe to newsletter. Online reservation available.",
      pageTextLength: 4000,
      hasEmail: true,
      hasWhatsAppSignal: true,
    });
    // No booking gap (has signal), no capture gap, no whatsapp gap, no follow-up gap
    expect(out.some((o) => o.type === "BOOKING_GAP")).toBe(false);
    expect(out.some((o) => o.type === "WHATSAPP_GAP")).toBe(false);
    expect(out.some((o) => o.type === "LEAD_CAPTURE_GAP")).toBe(false);
    expect(out.some((o) => o.type === "FOLLOW_UP_GAP")).toBe(false);
  });

  it("primaryOpportunity returns strongest first, null when empty", () => {
    const out = detectOpportunities({ ...base, websiteUrl: null, websiteReachable: false });
    expect(primaryOpportunity(out)?.type).toBe("WEBSITE_GAP");
    expect(primaryOpportunity([])).toBeNull();
  });
});
