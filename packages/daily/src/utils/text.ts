/**
 * Truncates text for push notifications without cutting mid-surrogate pair roughly.
 */
export function truncateForPush(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Builds a short Bark preview from a full markdown note.
 */
export function buildBarkPreview(markdown: string, maxChars: number): string {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const picked: string[] = [];
  for (const line of lines) {
    picked.push(line.replace(/^[-*]\s+/, ""));
    if (picked.join("\n").length >= maxChars) {
      break;
    }
  }

  return truncateForPush(picked.join("\n") || markdown, maxChars);
}

/**
 * Builds a compact Bark teaser when the full note is available via URL.
 */
export function buildBarkTeaser(markdown: string, maxChars = 320): string {
  const preview = buildBarkPreview(markdown, maxChars);
  const hint = "👉 点击通知查看全文";
  if (preview.includes(hint)) {
    return preview;
  }
  return `${preview}\n\n${hint}`;
}
