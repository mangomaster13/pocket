/**
 * A-share session helpers for Invest (pre-close 14:30 briefs).
 */

import { fetchEastmoneyPushJson } from "./eastmoney-http.js";

export interface MarketSession {
  /** Calendar date being evaluated (YYYY-MM-DD, Asia/Shanghai). */
  date: string;
  /** True only when this calendar date has live A-share session data. */
  isTradingDay: boolean;
  /** Human reason (Chinese) for open/closed. */
  reason: string;
  /** Latest date found on the Shanghai index minute trend, if any. */
  lastTradeDate?: string;
}

/**
 * Resolves whether `date` is an A-share trading day with usable live 分时 data.
 *
 * Rules:
 * 1. Sat/Sun in Asia/Shanghai → closed
 * 2. Otherwise fetch 上证分时; require the trend date === `date`
 *    (covers holidays and stale weekend snapshots)
 */
export async function resolveAshareSession(date: string): Promise<MarketSession> {
  if (isWeekendInShanghai(date)) {
    return {
      date,
      isTradingDay: false,
      reason: "周末休市",
    };
  }

  const lastTradeDate = await fetchShanghaiTrendDate();
  if (!lastTradeDate) {
    // Weekday with no tape usually means the quote API failed — do not pretend
    // the market is closed (that produced false "休市" notes on live days).
    throw new Error(
      `Unable to fetch 上证分时 for ${date}; refusing to mark a weekday as closed`,
    );
  }

  if (lastTradeDate !== date) {
    return {
      date,
      isTradingDay: false,
      lastTradeDate,
      reason: `非交易日或无当日实时分时（最近行情日 ${lastTradeDate}）`,
    };
  }

  return {
    date,
    isTradingDay: true,
    lastTradeDate,
    reason: "当日有上证分时，可做盘中观察",
  };
}

/**
 * Weekend check for a YYYY-MM-DD calendar date in Asia/Shanghai.
 */
export function isWeekendInShanghai(date: string): boolean {
  const weekday = weekdayInShanghai(date);
  return weekday === 0 || weekday === 6;
}

/**
 * Returns 0=Sun … 6=Sat for a YYYY-MM-DD date interpreted in Asia/Shanghai.
 */
export function weekdayInShanghai(date: string): number {
  const instant = new Date(`${date}T12:00:00+08:00`);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

/**
 * Reads the trade date from the latest Shanghai Composite minute bar.
 */
async function fetchShanghaiTrendDate(): Promise<string | undefined> {
  const path =
    "/api/qt/stock/trends2/get" +
    "?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
    "&fields2=f51,f53,f56,f58&ndays=1&iscr=0&secid=1.000001";
  try {
    const json = await fetchEastmoneyPushJson<{
      data?: { trends?: string[] };
    }>(path);
    const trends = json.data?.trends ?? [];
    const last = trends[trends.length - 1];
    if (!last) {
      return undefined;
    }
    // "2026-07-24 14:40,3814.20,..."
    const stamp = last.split(",")[0] ?? "";
    const day = stamp.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds a closed-market Invest note (no buy/sell grades).
 */
export function buildClosedMarketNote(
  date: string,
  session: MarketSession,
): string {
  const last =
    session.lastTradeDate != null
      ? `\n- 最近交易日：${session.lastTradeDate}`
      : "";
  return `# Fund Watch · ${date}

Invest · 休市 · ${date}

## Lead
Market closed — no live intraday tape, so no buy/sell grades today.

## 中文摘要
今日 A 股不开市（${session.reason}），**没有当日实时分时/成交量**，因此不给出买入/卖出等级，也不给操作建议。请下一交易日 14:30 再看。

## 状态
- 日期：${date}
- 原因：${session.reason}${last}

## 风险提示
- 休市日不做买卖建议；过往净值不代表下一交易日走势
- 本页仅作休市占位，不是持牌投顾意见
`;
}
