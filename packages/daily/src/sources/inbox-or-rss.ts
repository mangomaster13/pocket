import type { JobConfig } from "../config.js";
import type { SourceDocument } from "../types.js";
import { InboxSource } from "./inbox.js";
import { RssSource } from "./rss.js";
import type { SourcePaths, SourceProvider } from "./types.js";

/**
 * Prefers inbox content; falls back to RSS when inbox is empty.
 */
export class InboxOrRssSource implements SourceProvider {
  private readonly inbox = new InboxSource();
  private readonly rss = new RssSource();

  /**
   * Returns inbox docs when present, otherwise RSS docs.
   */
  async fetch(job: JobConfig, paths: SourcePaths): Promise<SourceDocument[]> {
    const inboxDocs = await this.inbox.fetch(job, paths);
    if (inboxDocs.length > 0) {
      return inboxDocs;
    }

    if (!job.source.sourceId && !job.source.rssUrl) {
      throw new Error(
        `Job "${job.id}" inbox is empty and no source.sourceId / source.rssUrl fallback is configured. ` +
          `Put article text in ${job.source.inboxFile ?? `inbox/${job.id}.md`}.`,
      );
    }

    return this.rss.fetch(job, paths);
  }
}
