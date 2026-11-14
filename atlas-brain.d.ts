export interface AtlasBrainOptions {
  storageKey?: string;
  maxHistory?: number;
  maxFacts?: number;
  answerThreshold?: number;
  suggestThreshold?: number;
  autoLearn?: boolean;
  safety?: boolean;
  fallback?: ((text: string, context: { history: HistoryItem[]; profile: Record<string, string> }) => string | null | Promise<string | null>) | null;
  now?: (() => Date) | null;
  llm?: LlmFunction | null;
}

export interface LlmRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  onToken?: (partialText: string) => void;
}
export type LlmFunction = (request: LlmRequest) => Promise<string>;

export interface WebLlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  moduleUrl?: string;
  onProgress?: ((report: { progress: number; text: string }) => void) | null;
}
export interface WebLlm extends LlmFunction {
  model: string;
  supported(): boolean;
  load(): Promise<unknown>;
}

export interface Thought { answer: string; source: string; trace: string; known: boolean; error?: string }
export interface RelationInfo { key: string; subject: string; category: string }

export interface LearnResult { ok: boolean; persisted?: boolean; message?: string; reason?: string }
export interface FactInfo { question: string; answer: string; tags: string[]; updatedAt: number }
export interface HistoryItem { user: string; assistant: string; at: number }
export interface ImportResult { ok: boolean; importedFacts?: number; importedItems?: number; importedRelations?: number; reason?: string }
export interface Stats { learnedFacts: number; rememberedItems: number; relations: number; conversationTurns: number }

export default class AtlasBrain {
  static version: string;
  constructor(options?: AtlasBrainOptions);
  respond(message: string): string;
  think(message: string): Thought;
  ask(message: string, hooks?: { onToken?: (partialText: string) => void }): Promise<Thought>;
  static webllm(options?: WebLlmOptions): WebLlm;
  explain(): string;
  listRelations(): RelationInfo[];
  learn(question: string, answer: string, tags?: string[]): LearnResult;
  remember(key: string, value: string): boolean;
  forget(key: string): boolean;
  listFacts(): FactInfo[];
  exportMemory(): string;
  importMemory(json: string | object, options?: { replace?: boolean }): ImportResult;
  getHistory(): HistoryItem[];
  getStats(): Stats;
  clearConversation(): void;
  clearAll(): void;
}
