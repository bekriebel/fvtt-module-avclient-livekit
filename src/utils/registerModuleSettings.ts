import { MODULE_NAME } from "./constants";
import { delayReload, getGame, registerModuleSetting } from "./helpers";
import * as log from "./logging";

export default function registerModuleSettings(): void {
  registerModuleSetting({
    name: "simulcast",
    scope: "world",
    // TODO: re-enable after simulcast doesn't crash the server
    config: false,
    // TODO: re-enable after simulcast doesn't crash the server
    default: false,
    type: Boolean,
    onChange: () => getGame().webrtc?.connect(),
  });

  registerModuleSetting({
    name: "resetRoom",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      if (value === true && getGame().user?.isGM) {
        log.warn("Resetting meeting room ID");
        getGame().settings.set(MODULE_NAME, "resetRoom", false);
        getGame().webrtc?.client.settings.set(
          "world",
          "server.room",
          randomID(32)
        );
      }
    },
  });

  // Register debug logging setting
  registerModuleSetting({
    name: "debug",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => delayReload(),
  });

  // Set the initial debug level
  log.setDebug(getGame().settings.get(MODULE_NAME, "debug") === true);

  // Register livekit trace logging setting
  registerModuleSetting({
    name: "livekitTrace",
    scope: "world",
    config: getGame().settings.get(MODULE_NAME, "debug") === true,
    default: false,
    type: Boolean,
    onChange: () => delayReload(),
  });
}
