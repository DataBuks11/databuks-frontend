const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY!;
const COMPOSIO_BASE = "https://backend.composio.dev/api/v2";

export interface ComposioConnection {
  id: string;
  appName: string;
  appId: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  createdAt: string;
  updatedAt: string;
  labels?: string[];
}

interface InitiateConnectionResponse {
  connectedAccountId: string;
  connectionStatus: string;
  redirectUrl?: string;
}

export async function initiateConnection(
  appName: string,
  entityId: string
): Promise<InitiateConnectionResponse> {
  const response = await fetch(`${COMPOSIO_BASE}/connectedAccounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": COMPOSIO_API_KEY,
    },
    body: JSON.stringify({
      appName,
      entityId,
      authMode: "OAUTH2",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio initiate failed: ${err}`);
  }

  return response.json();
}

export async function getConnections(
  entityId: string
): Promise<ComposioConnection[]> {
  const response = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts?entityId=${entityId}`,
    {
      headers: {
        "x-api-key": COMPOSIO_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio list failed: ${err}`);
  }

  const data = await response.json();
  return data.items ?? [];
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
    throw new Error(`Composio delete failed: ${err}`);
  }
}

export async function getConnectionStatus(
  connectionId: string
): Promise<ComposioConnection> {
  const response = await fetch(
    `${COMPOSIO_BASE}/connectedAccounts/${connectionId}`,
    {
      headers: {
        "x-api-key": COMPOSIO_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Composio status failed: ${err}`);
  }

  return response.json();
}
