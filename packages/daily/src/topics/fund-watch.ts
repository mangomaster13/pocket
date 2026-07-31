import type { SourceDocument, TopicDefinition } from "../types.js";

/**
 * Grade legend embedded in every Invest note (buy + sell, A–D).
 */
const GRADE_LEGEND = [
  "## 等级说明",
  "",
  "买入等级（越高越倾向买）：",
  "- **A**：较强买入信号，可考虑建仓/加仓",
  "- **B**：偏多，可小仓或分批试探",
  "- **C**：中性偏弱，建议观望，暂缓买入",
  "- **D**：偏空，不建议买入",
  "",
  "卖出等级（越高越倾向卖）：",
  "- **A**：较强卖出信号，建议减仓/离场",
  "- **B**：偏弱，可考虑减仓控制回撤",
  "- **C**：中性，暂无必要卖出",
  "- **D**：偏强持有，不建议卖出",
].join("\n");

/**
 * Daily fund watch — multi-role tape read (market + theme stocks → fund grades).
 */
export const fundWatchTopic: TopicDefinition = {
  id: "fund-watch",
  label: "invest",

  /**
   * Builds prompts: analyst / debate / trader / risk roles, then per-fund A–D grades.
   */
  buildPrompts(docs: SourceDocument[], context) {
    const sources = docs
      .map(
        (doc, index) =>
          `### Source ${index + 1}: ${doc.title}\n` +
          (doc.url ? `URL: ${doc.url}\n` : "") +
          `\n${doc.body}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt = [
      "You are the desk lead for Pocket Hub · Invest (Chinese A-share mutual-fund watch).",
      "Simulate a small multi-agent desk in ONE reply (do not invent fake tool calls).",
      "Roles to apply internally before writing the note:",
      "(1) Market/News analyst: 上证/深证/沪深300 tone, volume, macro/news risk into the close;",
      "(2) Technical analyst: index 分时 + theme stock tape (price/volume/relative strength);",
      "(3) Sentiment analyst: risk-on vs risk-off from breadth of theme stocks;",
      "(4) Bull researcher + (5) Bear researcher: short debate on each fund's theme;",
      "(6) Trader: map debate → fund action (买/不买/持有/减仓);",
      "(7) Risk manager: veto oversized optimism; keep grades consistent.",
      "HARD RULE: If Session says liveSession: no, or shanghaiTrendDate != sessionDate,",
      "refuse grades — say 休市/无当日实时分时 and give NO 买入等级/卖出等级.",
      "Only when liveSession: yes may you open fund pages / charts and related-stock quotes.",
      "Anchor conclusions in 个股+大盘 first, THEN translate into 基金建议 (funds are baskets of stocks).",
      "Do not invent prints you did not see; do not reuse a prior day's tape as today.",
      "For EACH fund (live days) output BOTH 买入等级 and 卖出等级 using ONLY A/B/C/D.",
      "Do not give Buy=A and Sell=A together without an explicit explanation.",
      "Write mainly in Chinese. Markdown only. No English vocabulary sections.",
      "Always end with a short risk disclaimer (personal research, not licensed advice).",
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      "Session: pre-close briefing (~14:30 Asia/Shanghai); official fund NAV publishes after 15:00.",
      "",
      "Produce a note with EXACTLY these sections (keep headings verbatim):",
      "",
      `# Fund Watch · ${context.date}`,
      "",
      `Invest · 14:30 多角色观察 · ${context.date}`,
      "",
      "## Lead",
      "- One English sentence: market/theme stance into the close",
      "",
      "## 中文摘要",
      "- 2-4 Chinese sentences: 大盘成交 + 主题个股强弱 + 基金整体买卖偏向",
      "",
      GRADE_LEGEND,
      "",
      "## 大盘与成交量",
      "- Summarize 上证 / 深证 / 沪深300: change, amount, amplifying vs drying volume",
      "- What that implies for risk appetite into 15:00",
      "",
      "## 分析师纪要",
      "Write three short bullets (2-4 lines each), grounded in source data:",
      "- **市场/新闻**: index + any clear macro/news tape risk (no fabricated headlines)",
      "- **技术面**: index 分时 shape + theme stock relative strength / weakness",
      "- **情绪面**: fear/greed read from breadth of related stocks (涨跌家数感)",
      "",
      "## 多空辩论",
      "For each fund theme (group by fund), 3-5 lines:",
      "- **多头**: strongest buy-case from stocks + volume",
      "- **空头**: strongest sell/risk case",
      "- Keep it concrete (name tickers / % when available)",
      "",
      "## 主题个股观察",
      "For key related stocks in the source (or top holdings seen on fund pages):",
      "- Bullet list: code/name · change · one-line tape note",
      "- Call out which stocks most drag/lift each fund today",
      "",
      "## 操作建议",
      "Fund-level decisions ONLY here (this is the deliverable users act on).",
      "For each watchlist fund, use this template:",
      "",
      "### {code} · {name}",
      "- **买入等级**: A|B|C|D",
      "- **卖出等级**: A|B|C|D",
      "- **主题映射**: which stocks/sectors drove today's view",
      "- **估值/净值**: intraday estimate if any, else latest published NAV",
      "- **分时观察**: fund page/chart read (or why unavailable)",
      "- **风控意见**: one line from the risk-manager role (仓位/回撤)",
      "- **结论**: one decisive Chinese sentence (买 / 不买 / 持有 / 减仓) tied to grades",
      "",
      "## 收盘前关注",
      "- 1-3 checklist items into 15:00 (index + theme stocks + NAV print risk)",
      "",
      "## 风险提示",
      "- Not licensed advice; NAV settles after close; multi-role notes are personal research only",
      "",
      "Source data (session, market board, index trends, related stocks, fund pages/charts):",
      sources,
    ].join("\n");

    return { systemPrompt, userPrompt };
  },

  /**
   * Ensures heading + grade legend are present.
   */
  finalize(rawText, context) {
    let text = rawText.trim();
    if (!text.startsWith("#")) {
      text = `# Fund Watch · ${context.date}\n\n${text}`;
    }
    if (!text.includes("## 等级说明")) {
      text = text.replace(
        /(##\s*中文摘要[\s\S]*?)(\n##\s+)/,
        `$1\n\n${GRADE_LEGEND}\n$2`,
      );
      if (!text.includes("## 等级说明")) {
        text = `${text}\n\n${GRADE_LEGEND}\n`;
      }
    }
    return `${text.trim()}\n`;
  },
};
