const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = "https://backend.composio.dev/api/v1";

if (!process.env.COMPOSIO_API_KEY) {
  console.warn("[DataBuks] COMPOSIO_API_KEY is not set in environment variables");
}

export interface ComposioConnection {
  id: string;
  integrationId: string;
  appName: string;
  appId: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "INITIATED";
  createdAt: string;
  updatedAt: string;
  labels?: string[];
  connectionParams?: Record<string, any>;
}

interface InitiateConnectionResponse {
  connectedAccountId: string;
  connectionStatus: string;
  redirectUrl?: string;
}

export async function initiateConnection(
  appName: string,
  entityId: string,
  redirectUri?: string
): Promise<InitiateConnectionResponse> {
  if (!entityId || entityId === "default") {
    throw new Error("A valid user entityId is required to initiate a Composio connection");
  }

  const callbackUrl = redirectUri || getRedirectUri(appName);

  const body: Record<string, any> = {
    integrationId: appName,
    appName,
    entityId,
    authMode: "OAUTH2",
    redirectUri: callbackUrl,
    labels: ["databuks"],
  };

  const response = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
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

  return response.json();
}

export async function getConnections(
  entityId: string
): Promise<ComposioConnection[]> {
  const response = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts?entityId=${entityId}&status=ACTIVE`,
    {
      headers: {
        "x-api-key": COMPOSIO_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio list failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.items ?? [];
}

export async function getConnectionById(
  connectionId: string
): Promise<ComposioConnection | null> {
  const response = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts/${connectionId}`,
    {
      headers: {
        "x-api-key": COMPOSIO_API_KEY,
      },
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
    `${COMPOSIO_BASE}/connectedAccounts/${connectionId}`,
    {
      method: "DELETE",
      headers: {
        "x-api-key": COMPOSIO_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio delete failed (${response.status}): ${err}`);
  }
}

export async function reinitiateConnection(
  connectionId: string
): Promise<InitiateConnectionResponse> {
  const response = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts/${connectionId}/reinitiate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": COMPOSIO_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio reinitiate failed (${response.status}): ${err}`);
  }

  return response.json();
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

function getRedirectUri(platform: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://databuks-frontend.vercel.app";

  return `${appUrl}/dashboard/socials?platform=${platform}`;
}
