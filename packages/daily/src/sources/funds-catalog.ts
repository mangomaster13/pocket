import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const relatedStockSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "A-share code must be 6 digits"),
  name: z.string().min(1).optional(),
});

const fundSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1).optional(),
  /** Theme label shown to the LLM (e.g. AI / 光模块). */
  theme: z.string().min(1).optional(),
  /** Theme proxy stocks used for multi-role market→fund mapping. */
  relatedStocks: z.array(relatedStockSchema).optional(),
});

const fundsFileSchema = z.object({
  funds: z.array(fundSchema).min(1),
});

export type RelatedStockEntry = z.infer<typeof relatedStockSchema>;
export type FundWatchEntry = z.infer<typeof fundSchema>;

/**
 * Loads the fund watchlist from config/funds.yaml.
 */
export function loadFundsCatalog(
  fundsFile = process.env.FUNDS_PATH ?? "config/funds.yaml",
  cwd = process.cwd(),
): FundWatchEntry[] {
  const absolute = resolve(cwd, fundsFile);
  const raw = readFileSync(absolute, "utf8");
  const parsed = fundsFileSchema.parse(parseYaml(raw));
  return parsed.funds;
}
