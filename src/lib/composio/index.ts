const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = "https://backend.composio.dev";

if (!process.env.COMPOSIO_API_KEY) {
  console.warn("[DataBuks] COMPOSIO_API_KEY is not set");
}

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
  userId: string,
  redirectUri?: string
): Promise<{ connectionId: string; redirectUrl: string | null }> {
  if (!userId || userId === "default") {
    throw new Error("A valid authenticated user ID is required");
  }

  const authConfigId = AUTH_CONFIGS[appName.toLowerCase()];
  if (!authConfigId) {
    throw new Error(
      `Missing COMPOSIO_${appName.toUpperCase()}_AUTH_CONFIG_ID environment variable. Add your ${appName} auth config ID from the Composio dashboard.`
    );
  }

  const callbackUrl = redirectUri || getDefaultRedirectUri(appName);

  const body: Record<string, any> = {
    auth_config: { id: authConfigId },
    connection: {},
    user_id: userId,
    redirect_url: callbackUrl,
  };

  const response = await fetch(`${COMPOSIO_BASE}/api/v3.1/connected_accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": COMPOSIO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio initiate failed (${response.status}): ${err}`);
  }

  const data = await response.json();

  const redirectUrl =
    data.redirect_url ||
    data.redirectUrl ||
    (data.connectionData?.authScheme === "OAUTH2" && data.connectionData?.val?.redirectUrl) ||
    null;

  return {
    connectionId: data.id,
    redirectUrl,
  };
}

export async function getConnections(
  userId: string
): Promise<ComposioConnection[]> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts?user_id=${userId}&status=ACTIVE`,
    {
      headers: { "x-api-key": COMPOSIO_API_KEY },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio list failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.data ?? data.items ?? [];
}

export async function getConnectionById(
  connectionId: string
): Promise<ComposioConnection | null> {
  const response = await fetch(
    `${COMPOSIO_BASE}/api/v3.1/connected_accounts/${connectionId}`,
    {
      headers: { "x-api-key": COMPOSIO_API_KEY },
    }
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

export async function getConnectionStatus(
  connectionId: string
): Promise<ComposioConnection> {
  const connection = await getConnectionById(connectionId);
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`);
  }
  return connection;
}

function getDefaultRedirectUri(platform: string): string {
  return `https://databuks-frontend.vercel.app/dashboard/socials?platform=${platform}`;
}
