import { MODULE_NAME, TAVERN_AUTH_SERVER } from "./constants";
import { Logger } from "./logger";
import debug from "debug";

const log = new Logger();

export default function registerModuleSettings(): void {
  game.settings?.register(MODULE_NAME, "displayConnectionQuality", {
    name: "LIVEKITAVCLIENT.displayConnectionQuality",
    hint: "LIVEKITAVCLIENT.displayConnectionQualityHint",
    scope: "client",
    config: true,
    default: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
    onChange: () => game.webrtc?.render(),
  });

  game.settings?.register(MODULE_NAME, "liveKitConnectionSettings", {
    name: "LIVEKITAVCLIENT.liveKitConnectionSettings",
    hint: "LIVEKITAVCLIENT.liveKitConnectionSettingsHint",
    scope: "world",
    config: false,
    default: {},
    requiresReload: true,
  });

  game.settings?.register(MODULE_NAME, "tavernPatreonToken", {
    name: "LIVEKITAVCLIENT.tavernPatreonToken",
    hint: "LIVEKITAVCLIENT.tavernPatreonTokenHint",
    scope: "world",
    config: false,
    default: "",
    type: new foundry.data.fields.StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    requiresReload: true,
  });

  game.settings?.register(MODULE_NAME, "breakoutRoomRegistry", {
    name: "LIVEKITAVCLIENT.breakoutRoomRegistry",
    hint: "LIVEKITAVCLIENT.breakoutRoomRegistryHint",
    scope: "client",
    config: false,
    default: {},
    requiresReload: false,
  });

  game.settings?.register(MODULE_NAME, "audioMusicMode", {
    name: "LIVEKITAVCLIENT.audioMusicMode",
    hint: "LIVEKITAVCLIENT.audioMusicModeHint",
    scope: "client",
    config: true,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    onChange: () => {
      game.webrtc?.client._liveKitClient
        .changeAudioSource(true)
        .catch((error: unknown) => {
          log.error("audioMusicMode: Error changing audio source", error);
        });
    },
  });

  game.settings?.register(MODULE_NAME, "useExternalAV", {
    name: "LIVEKITAVCLIENT.useExternalAV",
    hint: "LIVEKITAVCLIENT.useExternalAVHint",
    scope: "client",
    config: true,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true,
  });

  game.settings?.register(MODULE_NAME, "resetRoom", {
    name: "LIVEKITAVCLIENT.resetRoom",
    hint: "LIVEKITAVCLIENT.resetRoomHint",
    scope: "world",
    config: true,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    onChange: (value: boolean | null) => {
      if (value && game.user?.isGM) {
        log.warn("Resetting meeting room ID");
        game.settings
          .set(MODULE_NAME, "resetRoom", false)
          .then(() => {
            const liveKitConnectionSettings = game.settings.get(
              MODULE_NAME,
              "liveKitConnectionSettings",
            );
            liveKitConnectionSettings.room = foundry.utils.randomID(32);
            game.settings
              .set(
                MODULE_NAME,
                "liveKitConnectionSettings",
                liveKitConnectionSettings,
              )
              .catch((error: unknown) => {
                log.error("Error setting liveKitConnectionSettings:", error);
              });
          })
          .catch((error: unknown) => {
            log.error("Error resetting meeting room ID", error);
          });
      }
    },
    requiresReload: true,
  });

  // Register debug logging setting
  game.settings?.register(MODULE_NAME, "debug", {
    name: "LIVEKITAVCLIENT.debug",
    hint: "LIVEKITAVCLIENT.debugHint",
    scope: "world",
    config: true,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true,
  });

  // Register debug trace logging setting
  game.settings?.register(MODULE_NAME, "liveKitTrace", {
    name: "LIVEKITAVCLIENT.liveKitTrace",
    hint: "LIVEKITAVCLIENT.liveKitTraceHint",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "debug") ?? false,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true,
  });

  // Register devMode setting
  game.settings?.register(MODULE_NAME, "devMode", {
    name: "LIVEKITAVCLIENT.devMode",
    hint: "LIVEKITAVCLIENT.devModeHint",
    scope: "world",
    config: import.meta.env.MODE === "development",
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true,
  });

  //
  // devMode Settings
  //

  // TODO: The value for the authServer should be set by the selected LiveKit server
  // Register auth server setting
  game.settings?.register(MODULE_NAME, "authServer", {
    name: "LIVEKITAVCLIENT.authServer",
    hint: "LIVEKITAVCLIENT.authServerHint",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "devMode") ?? false,
    default: TAVERN_AUTH_SERVER,
    type: new foundry.data.fields.StringField({
      required: true,
      blank: false,
      initial: TAVERN_AUTH_SERVER,
    }),
    requiresReload: true,
  });

  // Register forced TURN setting
  game.settings?.register(MODULE_NAME, "forceTurn", {
    name: "LIVEKITAVCLIENT.forceTurn",
    hint: "LIVEKITAVCLIENT.forceTurnHint",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "devMode") ?? false,
    default: false,
    type: new foundry.data.fields.BooleanField({ initial: false }),
    requiresReload: true,
  });

  //
  // Set the initial debug level
  //
  if (game.settings?.get(MODULE_NAME, "debug")) {
    if (game.settings.get(MODULE_NAME, "liveKitTrace")) {
      debug.enable("*");
      log.info("Enabling trace logging");
    } else {
      debug.enable(
        `${MODULE_NAME}:DEBUG,${MODULE_NAME}:DEBUG:*,${MODULE_NAME}:INFO,${MODULE_NAME}:INFO:*,${MODULE_NAME}:WARN,${MODULE_NAME}:WARN:*,${MODULE_NAME}:ERROR,${MODULE_NAME}:ERROR:*`,
      );
      log.info("Enabling debug logging");
    }
    // Enable Foundry AV debug logging
    CONFIG.debug.av = true;
    CONFIG.debug.avclient = true;
  } else {
    debug.enable(
      `${MODULE_NAME}:INFO,${MODULE_NAME}:INFO:*,${MODULE_NAME}:WARN,${MODULE_NAME}:WARN:*,${MODULE_NAME}:ERROR,${MODULE_NAME}:ERROR:*`,
    );
    // Disable Foundry AV debug logging
    CONFIG.debug.av = false;
    CONFIG.debug.avclient = false;
  }
}
