export interface AiCompletionInput {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Lower reasoning effort = faster responses (real-time chat tasks) */
  reasoningEffort?: "low" | "medium" | "high";
  /** Hard timeout in ms. The provider will abort the HTTP request after this. */
  timeoutMs?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly modelVersion: string;
  completeJson(input: AiCompletionInput): Promise<Record<string, any>>;
}
