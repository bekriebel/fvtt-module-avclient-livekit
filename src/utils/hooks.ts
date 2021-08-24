import { MODULE_NAME } from "./constants";
import { getGame } from "./helpers";
import registerModuleSettings from "./registerModuleSettings";

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

Hooks.on(`${MODULE_NAME}DebugSet`, (value: boolean) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});

Hooks.on("ready", () => {
  Hooks.on(
    "renderCameraViews",
    (cameraViews: CameraViews, cameraViewsElement: JQuery<HTMLElement>) => {
      if (getGame().webrtc?.client?._liveKitClient) {
        getGame()?.webrtc?.client._liveKitClient.onRenderCameraViews(
          cameraViews,
          cameraViewsElement
        );
      }
    }
  );
});
