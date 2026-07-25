import { createClient } from "@/lib/supabase/server";

const LIB = (tag: string, data?: any) => {
  if (data !== undefined) console.log(`[LIB:composio:${tag}]`, typeof data === "object" ? JSON.stringify(data) : data);
  else console.log(`[LIB:composio:${tag}] TRIGGERED`);
};

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = "https://backend.composio.dev";
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://databuks-frontend.vercel.app";

const AUTH_CONFIGS: Record<string, string> = {
  instagram: process.env.COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID || "",
  facebook: process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID || "",
};

export interface ComposioConnection {
  id: string;
  integration_id: string;
  app_name?: string;
  status: "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED";
  created_at: string;
  updated_at: string;
}

export async function initiateConnection(
  appName: string,
  userId: string
): Promise<{ connectionId: string; redirectUrl: string | null }> {
  if (!userId) throw new Error("A valid authenticated user ID is required");

  const authConfigId = AUTH_CONFIGS[(appName ?? "").toLowerCase()];
  LIB("INITIATE", { appName, authConfigId, userId });
  if (!authConfigId) throw new Error(`Missing COMPOSIO_${appName.toUpperCase()}_AUTH_CONFIG_ID.`);

  const callbackUrl = `${BASE_URL}/api/composio/callback?platform=${appName}&userId=${userId}`;

  const body = {
    auth_config_id: authConfigId,
    user_id: userId,
    callback_url: callbackUrl,
  };
  LIB("INITIATE_REQUEST", { url: `${COMPOSIO_BASE}/api/v3/connected_accounts/link`, body });

  const response = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": COMPOSIO_API_KEY },
    body: JSON.stringify(body),
  });

  LIB("INITIATE_RESPONSE", { status: response.status, ok: response.ok });

  if (!response.ok) {
    const err = await response.text();
    LIB("INITIATE_ERROR", { status: response.status, body: err });
    throw new Error(`Composio link failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  LIB("INITIATE_RESULT", { connectionId: data.connected_account_id, redirectUrl: data.redirect_url, full: data });

  return {
    connectionId: data.connected_account_id || "",
    redirectUrl: data.redirect_url || null,
  };
}

export async function getConnections(userId: string): Promise<ComposioConnection[]> {
  LIB("GET_CONNECTIONS", { userId });
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts?user_id=${userId}`,
    { headers: { "x-api-key": COMPOSIO_API_KEY } }
  );
  LIB("GET_CONNECTIONS_RESPONSE", { status: response.status, ok: response.ok });
  if (!response.ok) {
    const err = await response.text();
    LIB("GET_CONNECTIONS_ERROR", { status: response.status, body: err });
    throw new Error(`Composio list failed (${response.status}): ${err}`);
  }
  const data = await response.json();
  const items = data.data ?? data.items ?? [];
  LIB("GET_CONNECTIONS_RESULT", { count: items.length, items: items.map((i:any) => ({ id: i.id, app: i.app_name || i.integration_id, status: i.status })) });
  return items;
}

export async function getConnectionById(connectionId: string): Promise<ComposioConnection | null> {
  LIB("GET_BY_ID", { connectionId });
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts/${connectionId}`,
    { headers: { "x-api-key": COMPOSIO_API_KEY } }
  );
  LIB("GET_BY_ID_RESPONSE", { status: response.status, ok: response.ok });
  if (!response.ok) {
    if (response.status === 404) { LIB("GET_BY_ID_404"); return null; }
    const err = await response.text();
    LIB("GET_BY_ID_ERROR", { status: response.status, body: err });
    throw new Error(`Composio get failed (${response.status}): ${err}`);
  }
  const data = await response.json();
  LIB("GET_BY_ID_RESULT", { id: data.id, status: data.status, app: data.app_name || data.integration_id, full: data });
  return data;
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts/${connectionId}`,
    { method: "DELETE", headers: { "x-api-key": COMPOSIO_API_KEY } }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio delete failed (${response.status}): ${err}`);
  }
}
