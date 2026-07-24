const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = "https://backend.composio.dev";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
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
  if (!authConfigId) {
    throw new Error(
      `Missing COMPOSIO_${appName.toUpperCase()}_AUTH_CONFIG_ID. Add it from Composio Dashboard.`
    );
  }

  const callbackUrl = `${APP_URL}/api/composio/callback?platform=${appName}&userId=${userId}`;

  const body = {
    auth_config_id: authConfigId,
    user_id: userId,
    callback_url: callbackUrl,
  };

  const response = await fetch(`${COMPOSIO_BASE}/api/v3/connected_accounts/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": COMPOSIO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio link failed (${response.status}): ${err}`);
  }

  const data = await response.json();

  return {
    connectionId: data.connected_account_id || "",
    redirectUrl: data.redirect_url || null,
  };
}

export async function getConnections(userId: string): Promise<ComposioConnection[]> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts?user_id=${userId}`,
    { headers: { "x-api-key": COMPOSIO_API_KEY } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio list failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.data ?? data.items ?? [];
}

export async function getConnectionById(connectionId: string): Promise<ComposioConnection | null> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts/${connectionId}`,
    { headers: { "x-api-key": COMPOSIO_API_KEY } }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const err = await response.text();
    throw new Error(`Composio get failed (${response.status}): ${err}`);
  }

  return response.json();
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts/${connectionId}`,
    {
      method: "DELETE",
      headers: { "x-api-key": COMPOSIO_API_KEY },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio delete failed (${response.status}): ${err}`);
  }
}
