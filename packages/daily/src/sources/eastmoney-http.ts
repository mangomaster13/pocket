/**
 * Shared Eastmoney HTTP helpers with host fallbacks (push2 is often flaky).
 */

/** Browser-like headers required by several Eastmoney quote endpoints. */
export const EASTMONEY_HEADERS: Record<string, string> = {
  Referer: "https://quote.eastmoney.com/",
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * Quote/push hosts tried in order. `push2` frequently drops connections from
 * cloud runners; `push2delay` is usually more reliable after the close.
 */
const PUSH_HOSTS = [
  "https://push2delay.eastmoney.com",
  "https://push2.eastmoney.com",
  "https://82.push2.eastmoney.com",
] as const;

/**
 * Fetches a push2-style Eastmoney JSON path, trying alternate hosts + retries.
 */
export async function fetchEastmoneyPushJson<T>(
  pathAndQuery: string,
  options: { attemptsPerHost?: number } = {},
): Promise<T> {
  const attemptsPerHost = options.attemptsPerHost ?? 2;
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const errors: string[] = [];

  for (const host of PUSH_HOSTS) {
    for (let attempt = 1; attempt <= attemptsPerHost; attempt += 1) {
      const url = `${host}${path}`;
      try {
        const response = await fetch(url, {
          headers: EASTMONEY_HEADERS,
        });
        if (!response.ok) {
          errors.push(`${host} HTTP ${response.status}`);
          continue;
        }
        return (await response.json()) as T;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${host} attempt ${attempt}: ${message}`);
        await sleep(250 * attempt);
      }
    }
  }

  throw new Error(`Eastmoney push fetch failed for ${path}: ${errors.join("; ")}`);
}

/**
 * Fetches an arbitrary Eastmoney URL with short retries (non-push hosts).
 */
export async function fetchEastmoneyJson<T>(
  url: string,
  options: {
    headers?: Record<string, string>;
    attempts?: number;
    allowHttpError?: boolean;
  } = {},
): Promise<T | undefined> {
  const attempts = options.attempts ?? 3;
  const headers = { ...EASTMONEY_HEADERS, ...options.headers };
  let lastError = "unknown";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (options.allowHttpError) {
          return undefined;
        }
        lastError = `HTTP ${response.status}`;
        await sleep(250 * attempt);
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(250 * attempt);
    }
  }

  if (options.allowHttpError) {
    return undefined;
  }
  throw new Error(`Eastmoney fetch failed for ${url}: ${lastError}`);
}

/**
 * Promise-based sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
