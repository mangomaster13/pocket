/**
 * Shared domain types for the daily digest pipeline.
 */

/** Supported content topics (extend by adding a topic module + registry entry). */
export type TopicId = "english-vocab" | "finance-brief" | "fund-watch";

/** High-level Pocket Hub product line. */
export type AppId = "articles" | "invest";

/** Supported source strategies. */
export type SourceType = "inbox" | "rss" | "inbox-or-rss" | "funds";

/** Supported LLM backends. */
export type LlmProviderId = "cursor-cloud-agent" | "openai-compatible";

/** Supported delivery channels for a job. */
export type DeliveryType = "bark" | "none";

/** Raw material fetched before LLM generation. */
export interface SourceDocument {
  /** Stable-ish id for logging (url, filename, etc.). */
  id: string;
  title: string;
  body: string;
  url?: string;
  /** Human outlet name (e.g. BBC World) for meta lines and archive cards. */
  sourceName?: string;
  fetchedAt: string;
}

/** Structured request passed to an LLM provider. */
export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Optional hint; providers may ignore or map differently. */
  model?: string;
}

/** Normalized LLM response. */
export interface LlmResponse {
  text: string;
  provider: LlmProviderId;
  model?: string;
  raw?: unknown;
}

/** Topic-specific generation contract. */
export interface TopicDefinition {
  id: TopicId;
  /** Short label used in filenames and logs. */
  label: string;
  /**
   * Builds prompts for the given source documents.
   */
  buildPrompts: (docs: SourceDocument[], context: TopicContext) => LlmRequest;
  /**
   * Optional post-process of model output before saving.
   */
  finalize?: (rawText: string, context: TopicContext) => string;
}

/** Runtime context available to topics. */
export interface TopicContext {
  jobId: string;
  date: string;
  /** Source documents for the current run (used by finalize). */
  docs?: SourceDocument[];
}

/** Result of a completed pipeline run. */
export interface PipelineResult {
  jobId: string;
  date: string;
  /** Notes/site category folder used for this run. */
  category: string;
  notePath: string;
  /** Generated HTML note page path, when site build succeeds. */
  pagePath?: string;
  /** Public GitHub Pages URL for the note, when configured. */
  pageUrl?: string;
  sourceIds: string[];
  delivered: boolean;
  preview: string;
  /** True when the job was skipped because the source was empty/optional. */
  skipped?: boolean;
}
