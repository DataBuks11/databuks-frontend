export interface ChannelRecommendation {
  channel: string;
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export function selectChannel(contacts: {
  hasPhone: boolean;
  hasWhatsAppEvidence: boolean | null;
  hasEmail: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
}): ChannelRecommendation | null {
  if (contacts.hasWhatsAppEvidence === true && contacts.hasPhone) {
    return { channel: "whatsapp", reason: "Phone available and WhatsApp activity verified", confidence: "HIGH" };
  }
  if (contacts.instagramUrl) {
    return { channel: "instagram", reason: "Active Instagram profile found on website", confidence: contacts.hasEmail ? "MEDIUM" : "HIGH" };
  }
  if (contacts.facebookUrl) {
    return { channel: "facebook", reason: "Facebook page found on website", confidence: "MEDIUM" };
  }
  if (contacts.linkedinUrl) {
    return { channel: "linkedin", reason: "LinkedIn company profile found", confidence: "MEDIUM" };
  }
  if (contacts.hasEmail) {
    return { channel: "email", reason: "Public email address found on website", confidence: "LOW" };
  }
  if (contacts.hasPhone) {
    return { channel: "phone", reason: "Phone number available but WhatsApp status unverified", confidence: "LOW" };
  }
  return null;
}
