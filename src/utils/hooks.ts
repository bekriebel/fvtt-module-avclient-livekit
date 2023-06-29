import { SocketMessage } from "../../types/avclient-livekit";
import LiveKitAVConfig from "../LiveKitAVConfig";
import { MODULE_NAME } from "./constants";
import { getGame, isVersion11AV } from "./helpers";
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

  // Add renderCameraViews hook after init
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

Hooks.on("ready", () => {
  // Add socket listener after ready
  getGame().socket?.on(
    `module.${MODULE_NAME}`,
    (message: SocketMessage, userId: string) => {
      if (getGame()?.webrtc?.client._liveKitClient) {
        getGame()?.webrtc?.client._liveKitClient.onSocketEvent(message, userId);
      }
    }
  );

  // Override the default settings menu with our own
  // WebRTC Control Menu
  getGame().settings.registerMenu("core", "webrtc", {
    name: "WEBRTC.Title",
    label: "WEBRTC.MenuLabel",
    hint: "WEBRTC.MenuHint",
    icon: "fas fa-headset",
    type: LiveKitAVConfig,
    restricted: false,
  });

  // TODO: Remove when FoundryVTT includes this patch
  if (!isVersion11AV()) {
    AVSettings.prototype.handleUserActivity = function handleUserActivity(
      userId: string,
      settings: AVSettingsData
    ) {
      const current = this.activity[userId] || {};
      this.activity[userId] = foundry.utils.mergeObject(current, settings, {
        inplace: false,
      });
      if (!ui.webrtc) return;
      const hiddenChanged =
        "hidden" in settings && current.hidden !== settings.hidden;
      const mutedChanged =
        "muted" in settings && current.muted !== settings.muted;
      if (
        (hiddenChanged || mutedChanged) &&
        ui.webrtc?.getUserVideoElement(userId)
      ) {
        // @ts-expect-error Using a protected method
        ui.webrtc._refreshView(userId);
      }
      if ("speaking" in settings)
        ui.webrtc?.setUserIsSpeaking(userId, settings.speaking || false);
    };
  }
});

// Listen for DebugSet event
Hooks.on(`${MODULE_NAME}DebugSet`, (value: boolean) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});

// Add context options on getUserContextOptions
Hooks.on(
  "getUserContextOptions",
  async (
    playersElement: JQuery<HTMLElement>,
    contextOptions: ContextMenuEntry[]
  ) => {
    if (getGame().webrtc?.client?._liveKitClient) {
      getGame().webrtc?.client._liveKitClient.onGetUserContextOptions(
        playersElement,
        contextOptions
      );
    }
  }
);
