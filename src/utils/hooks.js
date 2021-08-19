import { MODULE_NAME } from "./constants.js";
import registerModuleSettings from "./registerModuleSettings.js";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  // Override voice modes
  AVSettings.VOICE_MODES = {
    ALWAYS: "always",
    PTT: "ptt",
  };

  // Register module settings
  registerModuleSettings();
});

Hooks.on(`${MODULE_NAME}DebugSet`, (value) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});

Hooks.on("ready", () => {
  Hooks.on("renderCameraViews", (cameraViews, cameraViewsElement) => {
    if (game.webrtc?.client?._liveKitClient) {
      game.webrtc.client._liveKitClient.onRenderCameraViews(cameraViews, cameraViewsElement);
    }
  });
});
