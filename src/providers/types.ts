import type { LlmRequest, LlmResponse } from "../types.js";

/** Pluggable LLM backend. */
export interface LlmProvider {
  readonly id: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

/** Options shared when constructing providers from env + job config. */
export interface LlmProviderOptions {
  model?: string;
}
