import type { JobConfig } from "../config.js";
import type { SourceDocument } from "../types.js";
import type { SourcePaths, SourceProvider } from "./types.js";

interface RssItem {
  title: string;
  link?: string;
  description?: string;
}

/**
 * Fetches recent items from a simple RSS/Atom feed.
 */
export class RssSource implements SourceProvider {
  /**
   * Downloads the feed and returns the newest N items as documents.
   */
  async fetch(job: JobConfig, _paths: SourcePaths): Promise<SourceDocument[]> {
    const url = job.source.rssUrl;
    if (!url) {
      throw new Error(`Job "${job.id}" source.type=rss requires source.rssUrl`);
    }

    const count = job.source.rssItemCount ?? 1;
    const response = await fetch(url, {
      headers: { "User-Agent": "daily-sub/0.1 (+https://github.com/local/daily-sub)" },
    });
    if (!response.ok) {
      throw new Error(`RSS fetch failed (${response.status}): ${url}`);
    }

    const xml = await response.text();
    const items = parseRssItems(xml).slice(0, count);
    if (items.length === 0) {
      throw new Error(`No RSS items parsed from: ${url}`);
    }

    const fetchedAt = new Date().toISOString();
    return items.map((item, index) => ({
      id: item.link ?? `${url}#${index}`,
      title: item.title,
      body: buildRssBody(item),
      url: item.link,
      fetchedAt,
    }));
  }
}

/**
 * Formats one RSS item into LLM-friendly plain text.
 */
function buildRssBody(item: RssItem): string {
  const parts = [`Title: ${item.title}`];
  if (item.link) {
    parts.push(`URL: ${item.link}`);
  }
  if (item.description) {
    parts.push("", stripHtml(item.description));
  }
  return parts.join("\n");
}

/**
 * Minimal RSS/Atom item parser (good enough for major public feeds).
 */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];

  for (const block of blocks) {
    const title = decodeXml(firstTag(block, "title") ?? "Untitled");
    const link =
      firstAttr(block, "link", "href") ??
      decodeXml(firstTag(block, "link") ?? "") ??
      decodeXml(firstTag(block, "guid") ?? "") ??
      undefined;
    const description =
      firstTag(block, "description") ??
      firstTag(block, "summary") ??
      firstTag(block, "content") ??
      undefined;

    items.push({
      title,
      link: link || undefined,
      description: description ? decodeXml(stripCdata(description)) : undefined,
    });
  }

  return items;
}

/**
 * Returns the inner text of the first matching XML tag.
 */
function firstTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  return re.exec(xml)?.[1];
}

/**
 * Returns an attribute value from the first matching tag.
 */
function firstAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?>`, "i");
  return re.exec(xml)?.[1];
}

/**
 * Strips CDATA wrappers.
 */
function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1").trim();
}

/**
 * Decodes a few common XML entities.
 */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Removes HTML tags from feed descriptions.
 */
function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
