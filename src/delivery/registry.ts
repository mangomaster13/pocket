import type { DeliveryType } from "../types.js";
import { BarkDelivery, NoneDelivery } from "./bark.js";
import type { DeliveryChannel } from "./types.js";

export interface CreateDeliveryOptions {
  /** Bark device aliases to target. */
  targets?: string[];
}

/**
 * Builds a delivery channel by type.
 */
export function createDelivery(
  type: DeliveryType,
  options: CreateDeliveryOptions = {},
): DeliveryChannel {
  switch (type) {
    case "bark":
      return new BarkDelivery({ targets: options.targets });
    case "none":
      return new NoneDelivery();
    default: {
      const exhaustive: never = type;
      throw new Error(`Unsupported delivery type: ${exhaustive}`);
    }
  }
}
