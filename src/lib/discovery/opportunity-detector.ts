/**
 * OPPORTUNITY DETECTOR (deterministic, evidence-gated)
 *
 * Answers: "is business ke liye DataBuks ki kaunsi service me
 * actual scope hai — aur kis evidence ke basis par?"
 *
 * HARD RULES (spec: First Client Acquisition):
 * - Har opportunity ke saath supporting evidence REQUIRED hai.
 * - Bina evidence ke koi claim nahi (empty array allowed hai).
 * - AI guess nahi — sirf enrichment/website ke observed facts.
 * - "Outdated website" jaisa claim sirf tab jab text-length jaisa
 *   measurable signal ho; design quality kabhi claim mat karo.
 */

export type OpportunityType =
  | "WEBSITE_GAP"
  | "AUTOMATION_GAP"
  | "WHATSAPP_GAP"
  | "LEAD_CAPTURE_GAP"
  | "BOOKING_GAP"
  | "DIGITAL_PRESENCE_GAP"
  | "FOLLOW_UP_GAP"
  | "CUSTOM_SOFTWARE_OPPORTUNITY";

export type OpportunityStrength = "HIGH" | "MEDIUM" | "LOW";

export interface DetectedOpportunity {
  type: OpportunityType;
  strength: OpportunityStrength;
  /** Verbatim observed facts — yehi outreach me inject hote hain */
  evidence: string[];
  reason: string;
}

export interface OpportunityInput {
  businessName: string;
  /** Canonical category hint (AI verdict / industry match / "" ) */
  categoryHint: string;
  /** Raw text: snippets + enriched website page_text */
  fullText: string;
  websiteUrl: string | null;
  websiteReachable: boolean;
  /** Readable chars from enriched homepage (+contact page) */
  pageTextLength: number;
  hasPhone: boolean;
  hasEmail: boolean;
  /** wa.me link / whatsapp mention observed on site or listing */
  hasWhatsAppSignal: boolean;
  hasInstagram: boolean;
  hasFacebook: boolean;
}

const STRENGTH_RANK: Record<OpportunityStrength, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const CAPTURE_SIGNALS =
  /contact(\s|-)us|get (a|in) (quote|touch)|enquir|request (a )?(callback|quote|demo)|book (now|appointment|a visit|online)|appointment|sign ?up|subscribe|newsletter|register|call now|whatsapp (us|me|chat)/i;

const BOOKING_SIGNALS =
  /book (now|online|appointment|a table|a room)|online booking|reserve|reservation|schedule (a visit|an appointment)|appointment/i;

const MANUAL_PROCESS_SIGNALS =
  /call (us|to|for|on)|walk[\s-]?in|phone (booking|orders?|only)|order on (phone|whatsapp)|visit (us|our (store|shop|outlet))|drop (by|in)/i;

const WHATSAPP_SIGNALS = /wa\.me|whatsapp|whats app/i;

const NEWSLETTER_SIGNALS = /newsletter|subscribe|sign ?up for (updates|offers)|join (our|the) (mailing )?list/i;

const QUOTE_ORDER_SIGNALS =
  /quot|price on (request|call|enquiry)|call for (price|rates?)|order (on|via|through) (phone|whatsapp|call)|catalogue|product (list|range)/i;

/** Booking-heavy categories — deterministic keyword match on hint+name+text */
const BOOKING_CATEGORIES: { match: RegExp; label: string }[] = [
  { match: /hotel|resort|guest house|lodge|homestay/i, label: "hotel" },
  { match: /clinic|hospital|dental|doctor|physio|diagnostic/i, label: "clinic" },
  { match: /salon|spa|parlour|barber/i, label: "salon" },
  { match: /restaurant|cafe|caf[eé]|dhaba|eatery|food/i, label: "restaurant" },
  { match: /coach|institute|academy|classes|tuition|training/i, label: "coaching" },
  { match: /travel|tour|holiday|trips?|cab|taxi/i, label: "travel" },
  { match: /real estate|builder|property|plots?|flats?/i, label: "real estate" },
];

/** Custom-software-prone categories (manual quote/order workflows) */
const SOFTWARE_CATEGORIES: { match: RegExp; label: string }[] = [
  { match: /manufactur|factory|industrial/i, label: "manufacturing" },
  { match: /distributor|distributorship|wholesale|stockist|dealer/i, label: "distribution" },
  { match: /logistic|transport|fleet|cargo|movers/i, label: "logistics" },
  { match: /b2b|enterprise|bulk/i, label: "b2b services" },
];

function detectBookingCategory(haystack: string): string | null {
  for (const c of BOOKING_CATEGORIES) if (c.match.test(haystack)) return c.label;
  return null;
}

function detectSoftwareCategory(haystack: string): string | null {
  for (const c of SOFTWARE_CATEGORIES) if (c.match.test(haystack)) return c.label;
  return null;
}

export function detectOpportunities(input: OpportunityInput): DetectedOpportunity[] {
  const out: DetectedOpportunity[] = [];
  const text = `${input.businessName} ${input.categoryHint} ${input.fullText}`.slice(0, 8000);
  const pageText = input.fullText ?? "";

  // 1. WEBSITE_GAP — no reachable website at all (strongest website signal)
  if (!input.websiteUrl || !input.websiteReachable) {
    out.push({
      type: "WEBSITE_GAP",
      strength: "HIGH",
      evidence: [
        input.websiteUrl
          ? `Listed website ${input.websiteUrl} could not be fetched (unreachable)`
          : "No website discovered across directory, Maps and enrichment sources",
      ],
      reason: "Business has no working website — direct website development scope",
    });
    // Bina website ke baaki on-site gaps claim nahi kar sakte.
    // WhatsApp gap phir bhi valid hai (phone public, WhatsApp unknown).
    if (input.hasPhone && !input.hasWhatsAppSignal) {
      out.push({
        type: "WHATSAPP_GAP",
        strength: "MEDIUM",
        evidence: ["Public phone number found, but no WhatsApp link or mention observed"],
        reason: "Phone-based business with unverified WhatsApp — automation scope",
      });
    }
    return rankAndCap(out);
  }

  // 2. DIGITAL_PRESENCE_GAP — reachable site but thin content
  // (measurable: readable chars; design/looks par kabhi claim nahi)
  if (input.pageTextLength > 0 && input.pageTextLength < 800) {
    out.push({
      type: "DIGITAL_PRESENCE_GAP",
      strength: "MEDIUM",
      evidence: [`Homepage yields only ~${input.pageTextLength} readable characters (thin content)`],
      reason: "Website exists but carries little readable content — redesign/content scope",
    });
  }

  // 3. LEAD_CAPTURE_GAP — site hai par enquiry pakadne ka rasta nahi dikha
  if (!CAPTURE_SIGNALS.test(pageText)) {
    out.push({
      type: "LEAD_CAPTURE_GAP",
      strength: "MEDIUM",
      evidence: ["No contact form, enquiry, booking or callback signal found in website text"],
      reason: "Visitors have no clear way to enquire — lead-capture scope",
    });
  }

  // 4. BOOKING_GAP — booking-category + no booking signal
  const bookingCat = detectBookingCategory(`${input.categoryHint} ${input.businessName} ${pageText.slice(0, 2000)}`);
  if (bookingCat && !BOOKING_SIGNALS.test(pageText)) {
    out.push({
      type: "BOOKING_GAP",
      strength: "MEDIUM",
      evidence: [`${bookingCat} business, but no online booking/reservation signal on website`],
      reason: `${bookingCat} bookings still manual — booking-system scope`,
    });
  }

  // 5. WHATSAPP_GAP — phone public, WhatsApp presence unknown
  if (input.hasPhone && !WHATSAPP_SIGNALS.test(`${pageText} ${input.fullText}`) && !input.hasWhatsAppSignal) {
    out.push({
      type: "WHATSAPP_GAP",
      strength: input.hasInstagram || input.hasFacebook ? "MEDIUM" : "LOW",
      evidence: [
        "Public phone number found, but no WhatsApp link or mention observed",
        ...(input.hasInstagram || input.hasFacebook
          ? ["Business is socially active, yet no WhatsApp enquiry path observed"]
          : []),
      ],
      reason: "Customers likely call/DM manually — WhatsApp automation scope",
    });
  }

  // 6. AUTOMATION_GAP — manual-process language observed
  if (MANUAL_PROCESS_SIGNALS.test(pageText) && (input.hasPhone || input.hasEmail)) {
    const m = pageText.match(MANUAL_PROCESS_SIGNALS);
    out.push({
      type: "AUTOMATION_GAP",
      strength: "MEDIUM",
      evidence: [`Website itself says: "${(m?.[0] ?? "").trim().slice(0, 80)}" (manual process)`],
      reason: "Enquiry/order flow described as manual — automation scope",
    });
  }

  // 7. FOLLOW_UP_GAP — website hai, par retention signal nahi (weakest)
  if (!NEWSLETTER_SIGNALS.test(pageText) && !input.hasEmail) {
    out.push({
      type: "FOLLOW_UP_GAP",
      strength: "LOW",
      evidence: ["No newsletter/subscribe signal on website and no public email found"],
      reason: "No visible customer re-engagement path — follow-up automation scope",
    });
  }

  // 8. CUSTOM_SOFTWARE_OPPORTUNITY — B2B/manual-quote workflows
  const softCat = detectSoftwareCategory(`${input.categoryHint} ${input.businessName} ${pageText.slice(0, 2000)}`);
  if (softCat && QUOTE_ORDER_SIGNALS.test(pageText)) {
    const m = pageText.match(QUOTE_ORDER_SIGNALS);
    out.push({
      type: "CUSTOM_SOFTWARE_OPPORTUNITY",
      strength: "MEDIUM",
      evidence: [`${softCat} business with manual workflow signal: "${(m?.[0] ?? "").trim().slice(0, 80)}"`],
      reason: `${softCat} quotations/orders still manual — custom software scope`,
    });
  }

  return rankAndCap(out);
}

function rankAndCap(list: DetectedOpportunity[]): DetectedOpportunity[] {
  return [...list]
    .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength])
    .slice(0, 4);
}

/** One-line primary opportunity for outreach focus + UI */
export function primaryOpportunity(list: DetectedOpportunity[]): DetectedOpportunity | null {
  return list.length > 0 ? list[0] : null;
}
