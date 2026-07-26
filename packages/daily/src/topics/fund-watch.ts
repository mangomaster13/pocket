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
 * Daily fund watch topic — pre-close (14:40) intraday read + A–D buy/sell grades.
 */
export const fundWatchTopic: TopicDefinition = {
  id: "fund-watch",
  label: "invest",

  /**
   * Builds prompts for per-fund buy/sell grades from intraday + market volume.
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
      "You are a Chinese A-share mutual-fund watch assistant for Pocket Hub · Invest.",
      "The job runs around 14:40 Beijing time (before 15:00 close).",
      "HARD RULE: If source Session says liveSession: no, or shanghaiTrendDate != sessionDate,",
      "you MUST refuse grades — say 休市/无当日实时分时 and give NO 买入等级/卖出等级.",
      "Only when liveSession: yes may you inspect each fund's 分时 / valuation page URLs,",
      "and weigh: fund estimated move, theme volume feel, and broad market volume (上证/深证/沪深300).",
      "Do not invent chart shapes you did not see; do not recycle a previous trading day's tape as 'today'.",
      "For EACH fund (live days only) output BOTH 买入等级 and 卖出等级 using ONLY letters A/B/C/D.",
      "Keep grades consistent (do not give Buy=A and Sell=A together without a clear explanation).",
      "Write mainly in Chinese. Use Markdown. No vocabulary highlighting sections.",
      "Always end with a short risk disclaimer (algorithmic personal research, not licensed advice).",
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      "Session: pre-close briefing (~14:40 Asia/Shanghai); official fund NAV publishes after 15:00.",
      "",
      "Produce a note with EXACTLY these sections:",
      "",
      `# Fund Watch · ${context.date}`,
      "",
      "Invest · 14:40 分时观察 · ${context.date}",
      "",
      "## Lead",
      "- One English sentence on today's pre-close stance",
      "",
      "## 中文摘要",
      "- 2-4 Chinese sentences: market volume / index tone + overall buy-or-sell bias",
      "",
      GRADE_LEGEND,
      "",
      "## 大盘与成交量",
      "- Summarize 上证 / 深证 / 沪深300: price change, amount, whether volume is amplifying or drying up",
      "- Note what that implies for risk appetite into the close",
      "",
      "## 操作建议",
      "For each fund, use this template:",
      "",
      "### {code} · {name}",
      "- **买入等级**: A|B|C|D",
      "- **卖出等级**: A|B|C|D",
      "- **估值/净值**: estimated move if available, else latest published NAV",
      "- **分时观察**: what the intraday chart / volume suggests (or why chart was unavailable)",
      "- **结论**: one decisive Chinese sentence (买 / 不买 / 持有 / 减仓) tied to the two grades",
      "",
      "## 收盘前关注",
      "- 1-3 things to watch into 15:00",
      "",
      "## 风险提示",
      "- Not licensed advice; NAV settles after close; grades are personal research only",
      "",
      "Source data (includes market board, volume samples, fund pages & chart URLs):",
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
      // Insert legend after 中文摘要 when the model omitted it.
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
