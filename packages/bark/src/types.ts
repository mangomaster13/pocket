/** One named Bark endpoint. */
export interface BarkDevice {
  alias: string;
  key: string;
  server: string;
}

/** Title preset loaded from bark-presets.yaml. */
export interface BarkPreset {
  id: string;
  title: string;
  description?: string;
}

/** Public push payload accepted by `@pocket/bark`. */
export interface BarkPushInput {
  title: string;
  body: string;
  /** Optional deep link opened when the notification is tapped. */
  url?: string;
  /** Device aliases; omit/empty = all configured devices. */
  targets?: string[];
}
