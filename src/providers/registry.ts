import type { LlmProviderId } from "../types.js";
import { CursorCloudAgentProvider } from "./cursor-cloud-agent.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import type { LlmProvider, LlmProviderOptions } from "./types.js";

/**
 * Builds an LLM provider instance for the given id.
 */
export function createLlmProvider(
  providerId: LlmProviderId,
  options: LlmProviderOptions = {},
): LlmProvider {
  switch (providerId) {
    case "openai-compatible":
      return new OpenAiCompatibleProvider(options);
    case "cursor-cloud-agent":
      return new CursorCloudAgentProvider(options);
    default: {
      const exhaustive: never = providerId;
      throw new Error(`Unsupported LLM provider: ${exhaustive}`);
    }
  }
}
