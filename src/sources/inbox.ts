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
   * Loads inbox content when the file exists and is non-empty.
   */
  async fetch(job: JobConfig, paths: SourcePaths): Promise<SourceDocument[]> {
    const relative = job.source.inboxFile ?? `inbox/${job.id}.md`;
    const absolute = resolve(paths.cwd, relative);
    if (!existsSync(absolute)) {
      return [];
    }

    const body = readFileSync(absolute, "utf8").trim();
    if (!body) {
      return [];
    }

    const title = extractTitle(body) ?? `Inbox · ${job.id}`;
    return [
      {
        id: relative,
        title,
        body,
        fetchedAt: new Date().toISOString(),
      },
    ];
  }
}

/**
 * Uses the first markdown heading as title when present.
 */
function extractTitle(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}
