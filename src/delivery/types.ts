import type { DeliveryPayload } from "../types.js";

/** Push/notification channel. */
export interface DeliveryChannel {
  readonly id: string;
  deliver(payload: DeliveryPayload): Promise<void>;
}
