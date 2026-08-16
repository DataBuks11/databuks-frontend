export interface SocialProviderAdapter {
  readonly provider: string;
  getAccountInfo(accountId: string): Promise<{ valid: boolean; status: string; accountId: string }>;
  syncRecentEvents(accountId: string, limit?: number): Promise<SocialEventInput[]>;
  executeAction(action: {
    actionType: string;
    accountId: string;
    targetId?: string | null;
    content?: string | null;
  }): Promise<{ success: boolean; providerResponse: Record<string, any>; errorCode?: string; errorMessage?: string }>;
}

export interface SocialEventInput {
  provider: string;
  account_id: string;
  external_event_id: string;
  event_type: string;
  author_id?: string | null;
  author_name?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  content?: string | null;
  url?: string | null;
  timestamp?: string | null;
  raw_reference?: Record<string, any>;
}
