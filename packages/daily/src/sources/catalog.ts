import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const sourceEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["rss", "api", "scrape"]).default("rss"),
  url: z.string().url(),
  category: z.string().min(1),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

const catalogSchema = z.object({
  sources: z.array(sourceEntrySchema).min(1),
});

export type SourceEntry = z.infer<typeof sourceEntrySchema>;

/**
 * Loads the Pocket source roster from config/sources.yaml.
 */
export function loadSourceCatalog(
  configPath = process.env.SOURCES_PATH ?? "config/sources.yaml",
): SourceEntry[] {
  const absolute = resolve(process.cwd(), configPath);
  const raw = readFileSync(absolute, "utf8");
  return catalogSchema.parse(parseYaml(raw)).sources;
}

/**
 * Finds one source by id or throws.
 */
export function getSourceEntry(sourceId: string): SourceEntry {
  const found = loadSourceCatalog().find((item) => item.id === sourceId);
  if (!found) {
    const known = loadSourceCatalog()
      .map((item) => item.id)
      .join(", ");
    throw new Error(`Unknown sourceId "${sourceId}". Known: ${known}`);
  }
  return found;
}

/**
 * Lists sources, optionally filtered by category.
 */
export function listSourceCatalog(category?: string): SourceEntry[] {
  const all = loadSourceCatalog();
  if (!category) {
    return all;
  }
  return all.filter((item) => item.category === category);
}

/**
 * Resolves the RSS URL for a job from sourceId and/or explicit rssUrl.
 */
export function resolveJobRssUrl(source: {
  sourceId?: string;
  rssUrl?: string;
}): string | undefined {
  if (source.rssUrl?.trim()) {
    return source.rssUrl.trim();
  }
  if (source.sourceId?.trim()) {
    return getSourceEntry(source.sourceId.trim()).url;
  }
  return undefined;
}
