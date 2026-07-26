import { selectDevices } from "./devices.js";
import type { BarkDevice, BarkPushInput } from "./types.js";

/** Default public URL for the Pocket mango icon (Bark requires a remote image URL). */
const DEFAULT_BARK_ICON_URL =
  "https://raw.githubusercontent.com/mangomaster13/pocket/master/assets/icon.png";

/**
 * Resolves the Bark notification icon URL (env override or project default).
 */
export function resolveIconUrl(): string {
  return process.env.BARK_ICON?.trim() || DEFAULT_BARK_ICON_URL;
}

/**
 * Sends a push notification to one or more Bark devices.
 * This is the only delivery entrypoint other packages should use.
 */
export async function push(input: BarkPushInput): Promise<void> {
  const devices = selectDevices(input.targets);
  const failures: string[] = [];

  for (const device of devices) {
    try {
      await pushToDevice(device, input);
      console.log(`  bark ok → ${device.alias}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${device.alias}: ${message}`);
      console.warn(`  bark fail → ${device.alias}: ${message}`);
    }
  }

  if (failures.length === devices.length) {
    throw new Error(`Bark push failed for all devices: ${failures.join("; ")}`);
  }
  if (failures.length > 0) {
    throw new Error(`Bark push partially failed: ${failures.join("; ")}`);
  }
}

/**
 * Pushes one notification to a single Bark device.
 */
export async function pushToDevice(
  device: BarkDevice,
  input: Pick<BarkPushInput, "title" | "body" | "url">,
): Promise<void> {
  const endpoint = `${device.server}/push`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      device_key: device.key,
      title: input.title,
      body: input.body,
      url: input.url,
      icon: resolveIconUrl(),
      group: "pocket",
    }),
  });

  const raw = (await response.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
  };

  if (!response.ok || (typeof raw.code === "number" && raw.code !== 200)) {
    throw new Error(`${raw.message ?? response.statusText} (${response.status})`);
  }
}
