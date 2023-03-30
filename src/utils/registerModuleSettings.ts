import { MODULE_NAME } from "./constants";
import { delayReload, getGame, registerModuleSetting } from "./helpers";
import * as log from "./logging";

export default function registerModuleSettings(): void {
  registerModuleSetting({
    name: "displayConnectionQuality",
    scope: "client",
    config: true,
    default: true,
    type: Boolean,
    onChange: () => getGame().webrtc?.render(),
  });

  registerModuleSetting({
    name: "audioMusicMode",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => {
      // Re-register settings to update visibility of audioMusicModeRate
      registerModuleSettings();
      getGame().webrtc?.client._liveKitClient.changeAudioSource(true);
    },
  });

  registerModuleSetting<number>({
    name: "audioMusicModeRate",
    scope: "client",
    config: getGame().settings.get(MODULE_NAME, "audioMusicMode") === true,
    default: 96,
    type: Number,
    range: {
      min: 8,
      max: 224,
      step: 8,
    },
    onChange: () =>
      getGame().webrtc?.client._liveKitClient.changeAudioSource(true),
  });

  registerModuleSetting({
    name: "disableReceivingAudio",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => getGame().webrtc?.connect(),
  });

  registerModuleSetting({
    name: "disableReceivingVideo",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => getGame().webrtc?.connect(),
  });

  registerModuleSetting({
    name: "simulcast",
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: () => getGame().webrtc?.connect(),
  });

  registerModuleSetting({
    name: "useExternalAV",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => delayReload(),
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
    name: "liveKitTrace",
    scope: "world",
    config: getGame().settings.get(MODULE_NAME, "debug") === true,
    default: false,
    type: Boolean,
    onChange: () => delayReload(),
  });

  registerModuleSetting({
    name: "limitBitRate",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => delayReload(),
  });

  registerModuleSetting<number>({
    name: "maximumVideoRate",
    scope: "world",
    config: getGame().settings.get(MODULE_NAME, "limitBitRate") === true,
    default: 300,
    type: Number,
    onChange: () => delayReload(),
  });

  registerModuleSetting<number>({
    name: "maximumFrameRate",
    scope: "world",
    config: getGame().settings.get(MODULE_NAME, "limitBitRate") === true,
    default: 60,
    type: Number,
    onChange: () => delayReload(),
  });

}
