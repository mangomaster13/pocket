import type { JobConfig } from "../config.js";
import type { SourceDocument } from "../types.js";
import { todayInTimeZone } from "../utils/date.js";
import {
  fetchEastmoneyJson,
  fetchEastmoneyPushJson,
} from "./eastmoney-http.js";
import {
  loadFundsCatalog,
  type FundWatchEntry,
  type RelatedStockEntry,
} from "./funds-catalog.js";
import type { SourcePaths, SourceProvider } from "./types.js";

interface NavPoint {
  date: string;
  nav: string;
  accNav: string;
  changePct: string;
}

interface FundSnapshot {
  code: string;
  name: string;
  theme?: string;
  relatedStocks: RelatedStockEntry[];
  latestDate: string;
  latestNav: string;
  latestChangePct: string;
  estimateNav?: string;
  estimateChangePct?: string;
  estimateTime?: string;
  history: NavPoint[];
  pageUrl: string;
  chartUrl: string;
}

interface StockQuote {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  amount: number;
  turnover: number;
}

interface IndexQuote {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  amount: number;
  turnover: number;
}

interface IndexTrendPoint {
  time: string;
  price: number;
  volume: number;
}

/**
 * Fetches Chinese mutual-fund snapshots + market board for the Invest watchlist.
 */
export class FundsSource implements SourceProvider {
  /**
   * Loads funds.yaml, pulls NAV / estimate / chart URLs, and broad-market volume.
   */
  async fetch(job: JobConfig, paths: SourcePaths): Promise<SourceDocument[]> {
    const fundsFile = job.source.fundsFile ?? "config/funds.yaml";
    const historyDays = job.source.historyDays ?? 12;
    const catalog = loadFundsCatalog(fundsFile, paths.cwd);
    const sessionDate = paths.date ?? todayInTimeZone("Asia/Shanghai");

    const relatedEntries = uniqueRelatedStocks(catalog);
    const [snapshots, board, shTrends, relatedQuotes] = await Promise.all([
      Promise.all(catalog.map((entry) => fetchFundSnapshot(entry, historyDays))),
      fetchMarketBoard(),
      fetchIndexTrends("1.000001", 12),
      fetchStockQuotes(relatedEntries),
    ]);

    const trendDate = shTrends[shTrends.length - 1]?.time.slice(0, 10);
    const liveSession = trendDate === sessionDate;
    const fetchedAt = new Date().toISOString();
    const body = [
      formatSessionHeader({
        fetchedAt,
        sessionDate,
        liveSession,
        trendDate,
      }),
      "",
      formatMarketBoard(board),
      "",
      formatIndexTrends("上证指数分时抽样（含成交量）", shTrends),
      "",
      formatRelatedStocksMarkdown(catalog, relatedQuotes),
      "",
      "## Watchlist funds",
      "",
      liveSession
        ? "Read 大盘 + theme stocks first, then open each fund page/chart before grading the fund."
        : "WARNING: no live 分时 for sessionDate — do NOT invent buy/sell grades.",
      "",
      formatSnapshotsMarkdown(snapshots),
    ].join("\n");

    const codes = snapshots.map((item) => item.code).join(",");

    return [
      {
        id: `funds:${codes}`,
        title: liveSession
          ? `Fund watchlist · ${snapshots.length} funds (pre-close live)`
          : `Fund watchlist · ${snapshots.length} funds (stale / closed)`,
        body,
        sourceName: "Eastmoney Fund",
        url: "https://fund.eastmoney.com/",
        fetchedAt,
      },
    ];
  }
}

/**
 * Session banner for the LLM (14:30 pre-close framing).
 */
function formatSessionHeader(input: {
  fetchedAt: string;
  sessionDate: string;
  liveSession: boolean;
  trendDate?: string;
}): string {
  return [
    "## Session",
    `- sessionDate: ${input.sessionDate}`,
    `- liveSession: ${input.liveSession ? "yes" : "no"}`,
    `- shanghaiTrendDate: ${input.trendDate ?? "n/a"}`,
    `- Fetched at (UTC): ${input.fetchedAt}`,
    "- Intended local window: ~14:30 Asia/Shanghai (before 15:00 close)",
    "- Official fund NAV usually publishes after the close; prefer intraday estimate + 分时 when present",
    input.liveSession
      ? "- LIVE: grades must be based on today's tape / volume"
      : "- CLOSED/STALE: do not output buy/sell grades",
  ].join("\n");
}

/**
 * Fetches one fund's meta, NAV history, estimate fields, and chart/page URLs.
 */
async function fetchFundSnapshot(
  entry: FundWatchEntry,
  historyDays: number,
): Promise<FundSnapshot> {
  const [meta, history] = await Promise.all([
    fetchFundMeta(entry.code),
    fetchNavHistory(entry.code, historyDays),
  ]);

  const name = entry.name?.trim() || meta.name || entry.code;
  const latest = history[0];
  if (!latest) {
    throw new Error(`No NAV history for fund ${entry.code}`);
  }

  return {
    code: entry.code,
    name,
    theme: entry.theme?.trim() || undefined,
    relatedStocks: entry.relatedStocks ?? [],
    latestDate: latest.date,
    latestNav: latest.nav,
    latestChangePct: latest.changePct,
    estimateNav: meta.estimateNav,
    estimateChangePct: meta.estimateChangePct,
    estimateTime: meta.estimateTime,
    history,
    pageUrl: `https://fund.eastmoney.com/${entry.code}.html`,
    // Eastmoney daily/performance chart image (agent should also open the HTML page for live 分时)
    chartUrl: `https://j4.dfcfw.com/charts/pic6/${entry.code}.png`,
  };
}

/**
 * Dedupes related stocks across the watchlist (keeps first name label).
 */
function uniqueRelatedStocks(catalog: FundWatchEntry[]): RelatedStockEntry[] {
  const map = new Map<string, RelatedStockEntry>();
  for (const fund of catalog) {
    for (const stock of fund.relatedStocks ?? []) {
      if (!map.has(stock.code)) {
        map.set(stock.code, stock);
      }
    }
  }
  return [...map.values()];
}

/**
 * True when the 6-digit code is listed on Shanghai.
 */
function isShanghaiCode(code: string): boolean {
  return code.startsWith("6") || code.startsWith("5") || code.startsWith("9");
}

/**
 * Maps a 6-digit A-share code to an Eastmoney secid (SH=1 / SZ=0).
 */
function toEastmoneySecid(code: string): string {
  return `${isShanghaiCode(code) ? "1" : "0"}.${code}`;
}

/**
 * Eastmoney quote page for a 6-digit A-share code.
 */
function quotePageUrl(code: string): string {
  return `https://quote.eastmoney.com/${isShanghaiCode(code) ? "sh" : "sz"}${code}.html`;
}

/**
 * Fetches live quotes for theme proxy stocks (batched ulist).
 */
async function fetchStockQuotes(stocks: RelatedStockEntry[]): Promise<StockQuote[]> {
  if (stocks.length === 0) {
    return [];
  }
  const secids = stocks.map((s) => toEastmoneySecid(s.code)).join(",");
  const nameByCode = new Map(
    stocks.map((s) => [s.code, s.name?.trim() || ""] as const),
  );
  const path =
    "/api/qt/ulist.np/get" +
    "?fltt=2&fields=f12,f14,f2,f3,f5,f6,f8" +
    `&secids=${encodeURIComponent(secids)}`;
  try {
    const json = await fetchEastmoneyPushJson<{
      data?: {
        diff?: Array<{
          f12?: string;
          f14?: string;
          f2?: number;
          f3?: number;
          f5?: number;
          f6?: number;
          f8?: number;
        }>;
      };
    }>(path);
    return (json.data?.diff ?? []).map((row) => {
      const code = String(row.f12 ?? "");
      return {
        code,
        name: nameByCode.get(code) || String(row.f14 ?? code),
        price: Number(row.f2 ?? 0),
        changePct: Number(row.f3 ?? 0),
        volume: Number(row.f5 ?? 0),
        amount: Number(row.f6 ?? 0),
        turnover: Number(row.f8 ?? 0),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Formats theme → related-stock quotes for the multi-role prompt.
 */
function formatRelatedStocksMarkdown(
  catalog: FundWatchEntry[],
  quotes: StockQuote[],
): string {
  if (catalog.every((f) => !(f.relatedStocks && f.relatedStocks.length))) {
    return "## Theme related stocks\n- (none configured in funds.yaml)";
  }
  const quoteByCode = new Map(quotes.map((q) => [q.code, q]));
  const blocks = catalog.map((fund) => {
    const theme = fund.theme?.trim() || "theme";
    const stocks = fund.relatedStocks ?? [];
    if (stocks.length === 0) {
      return `### ${fund.code} · ${theme}\n- (no relatedStocks)`;
    }
    const lines = stocks.map((stock) => {
      const q = quoteByCode.get(stock.code);
      const label = stock.name?.trim() || q?.name || stock.code;
      if (!q) {
        return `- ${stock.code} ${label}: quote unavailable`;
      }
      return (
        `- ${stock.code} ${label}: ${q.price} · ${formatSignedPct(String(q.changePct))}` +
        ` · 额 ${formatCompact(q.amount)} · 换手 ${q.turnover.toFixed(2)}%` +
        ` · ${quotePageUrl(stock.code)}`
      );
    });
    return [`### ${fund.code} · ${theme}`, ...lines].join("\n");
  });
  return [
    "## Theme related stocks",
    "Use these 个股 prints (plus fund-page holdings) before grading each fund.",
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Resolves short name + optional intraday estimate from Eastmoney mobile API.
 */
async function fetchFundMeta(code: string): Promise<{
  name: string;
  estimateNav?: string;
  estimateChangePct?: string;
  estimateTime?: string;
}> {
  const url =
    "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo" +
    `?Fcodes=${encodeURIComponent(code)}&pageIndex=1&pageSize=1` +
    "&deviceid=pocket&plat=Android&product=EFund&version=1";
  const json = await fetchEastmoneyJson<{
    Datas?: Array<{
      SHORTNAME?: string;
      GSZ?: string | null;
      GSZZL?: string | null;
      GZTIME?: string | null;
    }>;
    Expansion?: { GZTIME?: string };
  }>(url, {
    headers: { Referer: "https://fund.eastmoney.com/" },
    allowHttpError: true,
  });
  if (!json) {
    return { name: "" };
  }
  const row = json.Datas?.[0];
  return {
    name: row?.SHORTNAME?.trim() ?? "",
    estimateNav: row?.GSZ ? String(row.GSZ) : undefined,
    estimateChangePct: row?.GSZZL != null ? String(row.GSZZL) : undefined,
    estimateTime: row?.GZTIME ?? json.Expansion?.GZTIME,
  };
}

/**
 * Fetches recent closed NAV rows (lsjz).
 */
async function fetchNavHistory(code: string, pageSize: number): Promise<NavPoint[]> {
  const url =
    "https://api.fund.eastmoney.com/f10/lsjz" +
    `?callback=&fundCode=${encodeURIComponent(code)}&pageIndex=1&pageSize=${pageSize}`;
  const json = await fetchEastmoneyJson<{
    Data?: {
      LSJZList?: Array<{
        FSRQ?: string;
        DWJZ?: string;
        LJJZ?: string;
        JZZZL?: string;
      }>;
    };
  }>(url, { headers: { Referer: "https://fund.eastmoney.com/" } });
  if (!json) {
    throw new Error(`Eastmoney lsjz failed for ${code}`);
  }
  const rows = json.Data?.LSJZList ?? [];
  return rows
    .filter((row) => row.FSRQ && row.DWJZ)
    .map((row) => ({
      date: row.FSRQ as string,
      nav: row.DWJZ as string,
      accNav: row.LJJZ ?? row.DWJZ ?? "",
      changePct: row.JZZZL ?? "",
    }));
}

/**
 * Fetches 上证 / 深证 / 沪深300 snapshot (price + volume + amount).
 */
async function fetchMarketBoard(): Promise<IndexQuote[]> {
  const path =
    "/api/qt/ulist.np/get" +
    "?fltt=2&fields=f12,f14,f2,f3,f5,f6,f8&secids=1.000001,0.399001,1.000300";
  const json = await fetchEastmoneyPushJson<{
    data?: {
      diff?: Array<{
        f12?: string;
        f14?: string;
        f2?: number;
        f3?: number;
        f5?: number;
        f6?: number;
        f8?: number;
      }>;
    };
  }>(path);
  return (json.data?.diff ?? []).map((row) => ({
    code: String(row.f12 ?? ""),
    name: String(row.f14 ?? ""),
    price: Number(row.f2 ?? 0),
    changePct: Number(row.f3 ?? 0),
    volume: Number(row.f5 ?? 0),
    amount: Number(row.f6 ?? 0),
    turnover: Number(row.f8 ?? 0),
  }));
}

/**
 * Fetches the last N intraday trend points for an index (price + volume).
 */
async function fetchIndexTrends(
  secid: string,
  tail: number,
): Promise<IndexTrendPoint[]> {
  const path =
    "/api/qt/stock/trends2/get" +
    "?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
    "&fields2=f51,f53,f56,f58&ndays=1&iscr=0" +
    `&secid=${encodeURIComponent(secid)}`;
  try {
    const json = await fetchEastmoneyPushJson<{
      data?: { trends?: string[] };
    }>(path);
    const trends = json.data?.trends ?? [];
    const sliced = trends.slice(Math.max(0, trends.length - tail));
    return sliced
      .map((line) => {
        const [time, price, volume] = line.split(",");
        return {
          time: time ?? "",
          price: Number(price ?? 0),
          volume: Number(volume ?? 0),
        };
      })
      .filter((point) => point.time);
  } catch {
    return [];
  }
}

/**
 * Formats market board markdown.
 */
function formatMarketBoard(board: IndexQuote[]): string {
  if (board.length === 0) {
    return "## Market board\n- (unavailable)";
  }
  const lines = board.map((item) => {
    return (
      `- ${item.name} (${item.code}): ${item.price} · ` +
      `${formatSignedPct(String(item.changePct))} · ` +
      `成交量 ${formatCompact(item.volume)} · ` +
      `成交额 ${formatCompact(item.amount)} · ` +
      `换手 ${item.turnover.toFixed(2)}%`
    );
  });
  return ["## Market board", ...lines].join("\n");
}

/**
 * Formats recent index minute samples.
 */
function formatIndexTrends(title: string, points: IndexTrendPoint[]): string {
  if (points.length === 0) {
    return `## ${title}\n- (unavailable)`;
  }
  const lines = points.map(
    (point) =>
      `- ${point.time}: ${point.price} · vol ${formatCompact(point.volume)}`,
  );
  return [`## ${title}`, ...lines].join("\n");
}

/**
 * Formats fund snapshots into markdown for the LLM prompt.
 */
function formatSnapshotsMarkdown(snapshots: FundSnapshot[]): string {
  return snapshots
    .map((fund) => {
      const historyLines = fund.history
        .map(
          (point) =>
            `- ${point.date}: NAV ${point.nav} · day ${formatSignedPct(point.changePct)}`,
        )
        .join("\n");
      const estimateLine =
        fund.estimateNav != null
          ? `- Intraday estimate: ${fund.estimateNav} · ${formatSignedPct(fund.estimateChangePct ?? "")}` +
            (fund.estimateTime ? ` · ${fund.estimateTime}` : "")
          : "- Intraday estimate: (not published yet / market closed)";
      const themeLine = fund.theme ? `- Theme: ${fund.theme}` : null;
      const relatedLine =
        fund.relatedStocks.length > 0
          ? `- Related stocks: ${fund.relatedStocks
              .map((s) => `${s.code}${s.name ? ` ${s.name}` : ""}`)
              .join(", ")}`
          : null;
      return [
        `### ${fund.code} · ${fund.name}`,
        "",
        themeLine,
        relatedLine,
        `- Fund page (open for live 分时 / holdings): ${fund.pageUrl}`,
        `- Chart image URL: ${fund.chartUrl}`,
        `- Latest published NAV date: ${fund.latestDate}`,
        `- Latest published NAV: ${fund.latestNav}`,
        `- Latest published day change: ${formatSignedPct(fund.latestChangePct)}`,
        estimateLine,
        "",
        "Recent published NAV history (newest first):",
        historyLines,
      ]
        .filter((line): line is string => line != null)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Formats a percent string with an explicit sign when numeric.
 */
function formatSignedPct(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "n/a";
  }
  const numeric = Number(trimmed);
  if (Number.isNaN(numeric)) {
    return `${trimmed}%`;
  }
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}%`;
}

/**
 * Compact number formatting for volume / amount.
 */
function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const abs = Math.abs(value);
  if (abs >= 1e12) {
    return `${(value / 1e12).toFixed(2)}万亿`;
  }
  if (abs >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (abs >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return value.toFixed(0);
}
