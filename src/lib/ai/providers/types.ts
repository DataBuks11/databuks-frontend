export interface AiCompletionInput {
  system: string;
  user: string;
  temperature?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly modelVersion: string;
  completeJson(input: AiCompletionInput): Promise<Record<string, any>>;
}
