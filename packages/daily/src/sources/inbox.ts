import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JobConfig } from "../config.js";
import type { SourceDocument } from "../types.js";
import type { SourcePaths, SourceProvider } from "./types.js";

/**
 * Reads a manually prepared markdown/text inbox file.
 */
export class InboxSource implements SourceProvider {
  /**
   * Loads inbox content when the file exists and has real article body.
   * Placeholder stubs (instructions + empty `---` section) count as empty.
   */
  async fetch(job: JobConfig, paths: SourcePaths): Promise<SourceDocument[]> {
    const relative = job.source.inboxFile ?? `inbox/${job.id}.md`;
    const absolute = resolve(paths.cwd, relative);
    if (!existsSync(absolute)) {
      return [];
    }

    const raw = readFileSync(absolute, "utf8").trim();
    if (!raw || isPlaceholderInbox(raw)) {
      return [];
    }

    const title = extractTitle(raw) ?? "";
    return [
      {
        id: relative,
        title,
        body: raw,
        fetchedAt: new Date().toISOString(),
      },
    ];
  }
}

/**
 * True when the inbox only has instructions / an empty article section.
 */
function isPlaceholderInbox(body: string): boolean {
  const article = extractArticleBody(body);
  if (article.length >= 40) {
    return false;
  }
  // No --- separator and very short overall body → placeholder.
  if (!body.includes("\n---\n") && body.length < 80) {
    return true;
  }
  return article.length === 0;
}

/**
 * Returns text after the first --- fence, or the body without a leading H1.
 */
function extractArticleBody(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (normalized.includes("\n---\n")) {
    return normalized.split("\n---\n").slice(1).join("\n---\n").trim();
  }
  return normalized.replace(/^#\s+.+?\n+/, "").trim();
}

/**
 * Uses the first markdown heading as title when present.
 */
function extractTitle(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  const title = match?.[1]?.trim();
  if (!title || /^\(optional\)/i.test(title)) {
    return undefined;
  }
  return title;
}
