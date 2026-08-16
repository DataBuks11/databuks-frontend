import type { SocialEventInput, SocialProviderAdapter } from "./types";

const BAILEYS_URL = process.env.BAILEYS_SERVER_URL;
const BAILEYS_KEY = process.env.BAILEYS_API_KEY || "dev-key";

export const whatsappAdapter: SocialProviderAdapter = {
  provider: "whatsapp",

  async getAccountInfo(accountId: string, _entityId?: string) {
    if (!BAILEYS_URL) return { valid: false, status: "unconfigured", accountId };
    try {
      const res = await fetch(`${BAILEYS_URL.replace(/\/+$/, "")}/status/${accountId}`, {
        headers: { "x-api-key": BAILEYS_KEY },
      });
      const data = await res.json();
      return { valid: !!data?.connected, status: data?.connected ? "connected" : "disconnected", accountId };
    } catch {
      return { valid: false, status: "unreachable", accountId };
    }
  },

  async syncRecentEvents(accountId: string, _entityId?: string, limit = 25): Promise<SocialEventInput[]> {
    if (!BAILEYS_URL) return [];
    try {
      const res = await fetch(
        `${BAILEYS_URL.replace(/\/+$/, "")}/messages/${accountId}?limit=${limit}`,
        { headers: { "x-api-key": BAILEYS_KEY } }
      );
      const data = await res.json();
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const events: SocialEventInput[] = [];
      for (const message of messages.slice(0, limit)) {
        if (message.fromMe) continue;
        events.push({
          provider: "whatsapp",
          account_id: accountId,
          external_event_id: String(message.messageId ?? `wa-${events.length}`),
          event_type: "message",
          author_id: message.remoteJid ?? null,
          author_name: message.pushName ?? null,
          content: message.text ?? null,
          timestamp: message.timestamp ?? null,
          raw_reference: message,
        });
      }
      return events;
    } catch {
      return [];
    }
  },

  async executeAction(action) {
    if (action.actionType !== "SEND_MESSAGE") {
      return {
        success: false,
        providerResponse: {},
        errorCode: "UNSUPPORTED_ACTION",
        errorMessage: `WhatsApp adapter does not support ${action.actionType}`,
      };
    }
    if (!BAILEYS_URL || !action.targetId || !action.content) {
      return {
        success: false,
        providerResponse: {},
        errorCode: "INVALID_INPUT",
        errorMessage: "BAILEYS_SERVER_URL, targetId and content are required",
      };
    }
    try {
      const res = await fetch(`${BAILEYS_URL.replace(/\/+$/, "")}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": BAILEYS_KEY },
        body: JSON.stringify({ userId: action.accountId, jid: action.targetId, message: action.content }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          providerResponse: data ?? {},
          errorCode: `BAILEYS_HTTP_${res.status}`,
          errorMessage: data?.error ?? `WhatsApp send failed (HTTP ${res.status})`,
        };
      }
      return { success: true, providerResponse: data ?? {} };
    } catch (error: any) {
      return {
        success: false,
        providerResponse: {},
        errorCode: "NETWORK_ERROR",
        errorMessage: error?.message ?? "WhatsApp server unreachable",
      };
    }
  },
};
