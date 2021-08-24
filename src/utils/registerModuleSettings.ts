import { MODULE_NAME } from "./constants";
import * as helpers from "./helpers";
import { getGame } from "./helpers";
import * as log from "./logging";

export default function registerModuleSettings(): void {
  helpers.registerModuleSetting({
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
  helpers.registerModuleSetting({
    name: "debug",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => helpers.delayReload(),
  });

  // Set the initial debug level
  log.setDebug(getGame().settings.get(MODULE_NAME, "debug") === true);

  // Register livekit trace logging setting
  helpers.registerModuleSetting({
    name: "livekitTrace",
    scope: "world",
    config: getGame().settings.get(MODULE_NAME, "debug") === true,
    default: false,
    type: Boolean,
    onChange: () => helpers.delayReload(),
  });
}
