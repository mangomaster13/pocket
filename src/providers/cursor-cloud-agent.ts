import { requireEnv } from "../utils/env.js";
import type { LlmRequest, LlmResponse } from "../types.js";
import type { LlmProvider, LlmProviderOptions } from "./types.js";

const API_BASE = "https://api.cursor.com/v1";

interface CreateAgentResponse {
  agent: { id: string; latestRunId?: string };
  run: { id: string; status: string };
}

interface RunResponse {
  id: string;
  status: string;
  result?: string;
}

/**
 * Cursor Cloud Agents API adapter.
 * Uses a no-repo agent and returns the terminal run result text.
 */
export class CursorCloudAgentProvider implements LlmProvider {
  readonly id = "cursor-cloud-agent" as const;

  private readonly apiKey: string;
  private readonly defaultModel?: string;

  /**
   * Creates a Cursor Cloud Agent provider.
   */
  constructor(options: LlmProviderOptions = {}) {
    this.apiKey = requireEnv("CURSOR_API_KEY");
    this.defaultModel = options.model;
  }

  /**
   * Launches a no-repo cloud agent, waits for completion, returns result text.
   */
  async generate(request: LlmRequest): Promise<LlmResponse> {
    const modelId = request.model ?? this.defaultModel;
    const promptText = [
      request.systemPrompt,
      "",
      request.userPrompt,
      "",
      "Return only the final markdown note. Do not ask follow-up questions.",
    ].join("\n");

    const createBody: Record<string, unknown> = {
      prompt: { text: promptText },
      name: "daily-sub note",
    };
    if (modelId) {
      createBody.model = { id: modelId };
    }

    const created = await this.requestJson<CreateAgentResponse>("/agents", {
      method: "POST",
      body: JSON.stringify(createBody),
    });

    const agentId = created.agent.id;
    const runId = created.run.id ?? created.agent.latestRunId;
    if (!runId) {
      throw new Error("Cursor Cloud Agent create response missing run id");
    }

    const finished = await this.waitForRun(agentId, runId);
    const text = finished.result?.trim();
    if (!text) {
      throw new Error(`Cursor Cloud Agent run ${runId} finished without result text`);
    }

    // Best-effort cleanup so agents do not accumulate indefinitely.
    await this.requestJson(`/agents/${agentId}/archive`, { method: "POST" }).catch(() => undefined);

    return {
      text,
      provider: this.id,
      model: modelId,
      raw: finished,
    };
  }

  /**
   * Polls a run until it reaches a terminal status.
   */
  private async waitForRun(
    agentId: string,
    runId: string,
    {
      timeoutMs = 90 * 60 * 1000,
      intervalMs = 5_000,
    }: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<RunResponse> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const run = await this.requestJson<RunResponse>(`/agents/${agentId}/runs/${runId}`);
      if (["FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(run.status)) {
        if (run.status !== "FINISHED") {
          throw new Error(`Cursor Cloud Agent run ended with status ${run.status}`);
        }
        return run;
      }
      await sleep(intervalMs);
    }
    throw new Error(`Cursor Cloud Agent run timed out after ${timeoutMs}ms`);
  }

  /**
   * Performs an authenticated JSON request against the Cursor API.
   */
  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const raw = (await response.json().catch(() => ({}))) as T & {
      message?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(
        `Cursor API ${path} failed (${response.status}): ${
          raw.error?.message ?? raw.message ?? response.statusText
        }`,
      );
    }

    return raw;
  }
}

/**
 * Promise-based sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
