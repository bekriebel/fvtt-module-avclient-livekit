import { LANG_NAME, MODULE_NAME } from "./constants";
import * as log from "./logging";

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

// Module Settings object
interface ModuleSettingsObject<T = unknown> {
  name: string;
  scope: string;
  config: boolean;
  default: boolean;
  type: BooleanConstructor | undefined;
  range?: T extends number
    ? {
        max: number;
        min: number;
        step: number;
      }
    : undefined;
  onChange: (value: T) => void;
}

/**
 * Helper methods
 */

/**
 * Issue a delayed (debounced) reload to the whole window.
 * Allows settings to get saved before reload
 */
export const delayReload: () => void = debounce(
  () => window.location.reload(),
  100
);

export const sleep: (delay: number) => Promise<void> = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

/**
 * Transform the device info array from enumerated devices into an object with {id: label} keys
 * @param {Array} list    The list of devices
 */
export function deviceInfoToObject(
  list: DeviceInfo[],
  kind: "audio" | "video"
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].kind === kind) {
      obj[list[i].deviceId] =
        list[i].label || getGame().i18n.localize("WEBRTC.UnknownDevice");
    }
  }

  return obj;
}

export function getCanvas(): Canvas {
  if (!(canvas instanceof Canvas) || !canvas.ready) {
    throw new Error("Canvas is not yet ready.");
  }
  return canvas;
}

export function getGame(): Game {
  if (!(game instanceof Game)) {
    throw new Error("Game is not yet initialized.");
  }
  return game;
}

/**
 * Dynamically load additional script files, returning when loaded
 * @param scriptSrc    The location of the script file
 */
export async function loadScript(scriptSrc: string): Promise<boolean> {
  log.debug("Loading script:", scriptSrc);
  return new Promise((resolve, reject) => {
    // Skip loading script if it is already loaded
    if ($(`script[src="${scriptSrc}"]`).length > 0) {
      log.debug("Script already loaded:", scriptSrc);
      resolve(true);
      return;
    }

    const scriptElement = document.createElement("script");
    $("head").append(scriptElement);

    scriptElement.type = "text/javascript";
    scriptElement.src = scriptSrc;
    scriptElement.onload = () => {
      log.debug("Loaded script", scriptSrc);
      resolve(true);
    };
    scriptElement.onerror = (err) => {
      log.error("Error loading script", scriptSrc);
      reject(err);
    };
  });
}

export function registerModuleSetting(
  settingsObject: ModuleSettingsObject
): void {
  getGame().settings.register(MODULE_NAME, settingsObject.name, {
    name: `${LANG_NAME}.${settingsObject.name}`,
    hint: `${LANG_NAME}.${settingsObject.name}Hint`,
    scope: settingsObject.scope,
    config: settingsObject.config,
    default: settingsObject.default,
    type: settingsObject.type,
    range: settingsObject.range,
    onChange: settingsObject.onChange,
  });
}
