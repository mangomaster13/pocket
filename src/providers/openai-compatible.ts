import { optionalEnv, requireEnv } from "../utils/env.js";
import type { LlmRequest, LlmResponse } from "../types.js";
import type { LlmProvider, LlmProviderOptions } from "./types.js";

/**
 * OpenAI Chat Completions-compatible provider (OpenAI, DeepSeek, etc.).
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = "openai-compatible" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  /**
   * Creates a provider from environment variables and optional job overrides.
   */
  constructor(options: LlmProviderOptions = {}) {
    this.apiKey = requireEnv("LLM_API_KEY");
    this.baseUrl = optionalEnv("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
    this.defaultModel = options.model ?? optionalEnv("LLM_MODEL", "gpt-4o-mini");
  }

  /**
   * Calls chat/completions and returns assistant text.
   */
  async generate(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? this.defaultModel;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
      }),
    });

    const raw = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible request failed (${response.status}): ${raw.error?.message ?? response.statusText}`,
      );
    }

    const text = raw.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("OpenAI-compatible response missing choices[0].message.content");
    }

    return {
      text,
      provider: this.id,
      model: raw.model ?? model,
      raw,
    };
  }
}
