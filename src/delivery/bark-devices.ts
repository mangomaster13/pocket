import { optionalEnv } from "../utils/env.js";

/** One named Bark endpoint. */
export interface BarkDevice {
  alias: string;
  key: string;
  server: string;
}

/**
 * Resolves Bark devices from environment variables.
 *
 * Preferred:
 *   BARK_DEVICES=daj,lzx
 *   BARK_KEY_daj=...
 *   BARK_KEY_lzx=...
 *   BARK_SERVER=https://api.day.app          (shared default)
 *   BARK_SERVER_daj=https://...              (optional per device)
 *
 * Fallback (single device, alias "default"):
 *   BARK_KEY=...
 */
export function resolveBarkDevices(): BarkDevice[] {
  const defaultServer = optionalEnv("BARK_SERVER", "https://api.day.app").replace(/\/$/, "");
  const listed = process.env.BARK_DEVICES?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (listed && listed.length > 0) {
    return listed.map((alias) => {
      const key =
        process.env[`BARK_KEY_${alias}`]?.trim() ||
        process.env[`BARK_KEY_${alias.toUpperCase()}`]?.trim();
      if (!key) {
        throw new Error(`Missing BARK_KEY_${alias} for device alias "${alias}"`);
      }
      const server = (
        process.env[`BARK_SERVER_${alias}`]?.trim() ||
        process.env[`BARK_SERVER_${alias.toUpperCase()}`]?.trim() ||
        defaultServer
      ).replace(/\/$/, "");
      return { alias, key, server };
    });
  }

  const single = process.env.BARK_KEY?.trim();
  if (!single) {
    throw new Error(
      "No Bark devices configured. Set BARK_DEVICES + BARK_KEY_<alias>, or BARK_KEY.",
    );
  }

  return [{ alias: "default", key: single, server: defaultServer }];
}

/**
 * Filters resolved devices by alias list. Empty/undefined targets means all devices.
 */
export function selectBarkDevices(targets?: string[]): BarkDevice[] {
  const devices = resolveBarkDevices();
  if (!targets || targets.length === 0) {
    return devices;
  }

  const wanted = new Set(targets.map((item) => item.trim()).filter(Boolean));
  const selected = devices.filter((device) => wanted.has(device.alias));
  const missing = [...wanted].filter((alias) => !devices.some((device) => device.alias === alias));
  if (missing.length > 0) {
    const known = devices.map((device) => device.alias).join(", ");
    throw new Error(`Unknown Bark alias(es): ${missing.join(", ")}. Known: ${known}`);
  }
  return selected;
}
