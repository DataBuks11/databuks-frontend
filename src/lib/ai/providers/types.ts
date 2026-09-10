export interface AiCompletionInput {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Lower reasoning effort = faster responses (real-time chat tasks) */
  reasoningEffort?: "low" | "medium" | "high";
  /** Hard timeout in ms. The provider will abort the HTTP request after this. */
  timeoutMs?: number;
  /** Max LLM attempts (default 2). Use 1 for latency-critical paths where a
   *  fallback + later retry is preferable to blowing the lambda budget. */
  maxAttempts?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly modelVersion: string;
  completeJson(input: AiCompletionInput): Promise<Record<string, any>>;
}
