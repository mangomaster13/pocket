import type { SourceType } from "../types.js";
import { InboxSource } from "./inbox.js";
import { InboxOrRssSource } from "./inbox-or-rss.js";
import { RssSource } from "./rss.js";
import type { SourceProvider } from "./types.js";

const registry: Record<SourceType, SourceProvider> = {
  inbox: new InboxSource(),
  rss: new RssSource(),
  "inbox-or-rss": new InboxOrRssSource(),
};

/**
 * Resolves a source strategy by type.
 */
export function getSourceProvider(type: SourceType): SourceProvider {
  const provider = registry[type];
  if (!provider) {
    throw new Error(`Unsupported source type: ${type}`);
  }
  return provider;
}
