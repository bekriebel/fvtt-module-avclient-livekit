import { Logger } from "./logger";
import { MODULE_NAME } from "./constants";

const log = new Logger();

/**
 * Typescript Interfaces
 */

// AV Device Info object
interface DeviceInfo {
  deviceId: string;
  groupId: string;
  label: string;
  kind: "audio" | "video";
}

/**
 * Helper methods
 */

/**
 * Issue a delayed (debounced) reload to the whole window.
 * Allows settings to get saved before reload
 */
export const delayReload: () => void = foundry.utils.debounce(() => {
  window.location.reload();
}, 100);

export const debounceRender: () => void = foundry.utils.debounce(
  () => game.webrtc?.render(),
  200,
);

const pendingRefreshUsers = new Set<string>();
const _executeRefresh = foundry.utils.debounce(() => {
  const users = [...pendingRefreshUsers];
  pendingRefreshUsers.clear();
  for (const userId of users) {
    ui.webrtc?.render({ parts: [userId] }).catch((error: unknown) => {
      log.error("Error refreshing user view:", error);
    });
  }
}, 200);

export function debounceRefreshView(userId: string): void {
  pendingRefreshUsers.add(userId);
  _executeRefresh();
}

export const sleep: (delay: number) => Promise<void> = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

export function callWhenReady(fnToCall: () => unknown): void {
  if (game.ready) {
    log.debug("callWhenReady now", fnToCall);
    fnToCall();
  } else {
    log.debug("callWhenReady ready", fnToCall);
    Hooks.once("ready", fnToCall);
  }
}

/**
 * Transform the device info array from enumerated devices into an object with {id: label} keys
 * @param {Array} list    The list of devices
 */
export function deviceInfoToObject(
  list: DeviceInfo[],
  kind: "audio" | "video",
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const device of list) {
    if (device.kind === kind) {
      obj[device.deviceId] =
        (device.label || game.i18n?.localize("WEBRTC.UnknownDevice")) ??
        "unknown";
    }
  }

  return obj;
}

export function getLiveKitUrl(address: string): string {
  const protocol = game.settings?.get(MODULE_NAME, "devMode") ? "ws" : "wss";
  return `${protocol}://${address}`;
}
