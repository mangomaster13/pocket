/**
 * Returns YYYY-MM-DD in Asia/Shanghai (default) for note naming.
 */
export function todayInTimeZone(timeZone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Compact MMDD label for notification titles.
 */
export function shortDateLabel(date = todayInTimeZone()): string {
  const [, month, day] = date.split("-");
  return `${month}${day}`;
}
