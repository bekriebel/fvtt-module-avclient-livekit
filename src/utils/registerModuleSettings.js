import { MODULE_NAME } from "./constants.js";
import * as helpers from "./helpers.js";
import * as log from "./logging.js";

export default function registerModuleSettings() {
  helpers.registerModuleSetting({
    name: "resetRoom",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      if (value && game.user.isGM) {
        log.warn("Resetting meeting room ID");
        game.settings.set(MODULE_NAME, "resetRoom", false);
        game.webrtc.client.settings.set("world", "server.room", randomID(32));
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
    onChange: (value) => log.setDebug(value),
  });

  // Set the initial debug level
  log.setDebug(game.settings.get(MODULE_NAME, "debug"));

  // Register livekit trace logging setting
  helpers.registerModuleSetting({
    name: "livekitTrace",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "debug"),
    default: false,
    type: Boolean,
    onChange: () => helpers.delayReload(),
  });
}
