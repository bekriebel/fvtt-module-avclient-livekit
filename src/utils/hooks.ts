import { MODULE_NAME } from "./constants";
import { getGame } from "./helpers";
import registerModuleSettings from "./registerModuleSettings";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  // Override voice modes
  // @ts-expect-error - we are overriding this value
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
    // @ts-expect-error - we are extending this
    if (getGame().webrtc?.client?._liveKitClient) {
      // @ts-expect-error - we are extending this
      getGame()?.webrtc?.client._liveKitClient.onRenderCameraViews(cameraViews, cameraViewsElement);
    }
  });
});
