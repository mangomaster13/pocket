import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BarkPreset } from "./types.js";

const presetsFileSchema = z.object({
  presets: z.record(
    z.string(),
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
});

/**
 * Loads Bark title presets from config/bark-presets.yaml.
 */
export function listPresets(
  configPath = process.env.BARK_PRESETS_PATH ?? "config/bark-presets.yaml",
): BarkPreset[] {
  const absolute = resolve(process.cwd(), configPath);
  const raw = readFileSync(absolute, "utf8");
  const parsed = presetsFileSchema.parse(parseYaml(raw));
  return Object.entries(parsed.presets).map(([id, value]) => ({
    id,
    title: value.title,
    description: value.description,
  }));
}

/**
 * Resolves a preset id to its title, or throws if unknown.
 */
export function resolvePresetTitle(presetId: string): string {
  const presets = listPresets();
  const found = presets.find((item) => item.id === presetId);
  if (!found) {
    const known = presets.map((item) => item.id).join(", ");
    throw new Error(`Unknown Bark preset "${presetId}". Known: ${known}`);
  }
  return found.title;
}

/**
 * Picks the notification title from explicit title, preset, or fallback.
 * Precedence: explicit title > preset > fallback.
 */
export function resolveTitle(options: {
  title?: string;
  preset?: string;
  fallback?: string;
}): string {
  if (options.title?.trim()) {
    return options.title.trim();
  }
  if (options.preset?.trim()) {
    return resolvePresetTitle(options.preset.trim());
  }
  return options.fallback?.trim() || "Pocket";
}
