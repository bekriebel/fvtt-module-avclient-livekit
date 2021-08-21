import { MODULE_NAME } from "./constants";
import { getGame } from "./helpers";
import registerModuleSettings from "./registerModuleSettings";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  // Override voice modes
  // @ts-expect-error - TODO: Fix after this is merged: https://github.com/League-of-Foundry-Developers/foundry-vtt-types/pull/1159
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
  Hooks.on("renderCameraViews", (cameraViews, cameraViewsElement) => {
    // @ts-expect-error - TODO: Fix after this is merged: https://github.com/League-of-Foundry-Developers/foundry-vtt-types/pull/1159
    if (getGame().webrtc?.client?._liveKitClient) {
      // @ts-expect-error - TODO: Fix after this is merged: https://github.com/League-of-Foundry-Developers/foundry-vtt-types/pull/1159
      getGame()?.webrtc?.client._liveKitClient.onRenderCameraViews(
        cameraViews,
        cameraViewsElement
      );
    }
  });
});
