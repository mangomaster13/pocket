import type { DeliveryPayload } from "../types.js";
import { selectBarkDevices, type BarkDevice } from "./bark-devices.js";
import type { DeliveryChannel } from "./types.js";

export interface BarkDeliveryOptions {
  /** Alias list from job config; omit/empty = all configured devices. */
  targets?: string[];
}

/**
 * Bark iOS push delivery with multi-device alias support.
 */
export class BarkDelivery implements DeliveryChannel {
  readonly id = "bark" as const;

  private readonly targets?: string[];

  /**
   * Creates a Bark client for selected device aliases.
   */
  constructor(options: BarkDeliveryOptions = {}) {
    this.targets = options.targets;
  }

  /**
   * Sends a push notification to one or more Bark devices.
   */
  async deliver(payload: DeliveryPayload): Promise<void> {
    const devices = selectBarkDevices(this.targets);
    const failures: string[] = [];

    for (const device of devices) {
      try {
        await pushToDevice(device, payload);
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
}

/**
 * Pushes one notification to a single Bark device.
 */
export async function pushToDevice(device: BarkDevice, payload: DeliveryPayload): Promise<void> {
  const endpoint = `${device.server}/push`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      device_key: device.key,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      group: "daily-sub",
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

/**
 * No-op delivery for dry runs.
 */
export class NoneDelivery implements DeliveryChannel {
  readonly id = "none" as const;

  /**
   * Skips delivery intentionally.
   */
  async deliver(_payload: DeliveryPayload): Promise<void> {
    return;
  }
}
