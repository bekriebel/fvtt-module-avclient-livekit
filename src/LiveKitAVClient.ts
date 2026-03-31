import {
  LogLevel,
  RemoteAudioTrack,
  RoomConnectOptions,
  ConnectionState,
  setLogLevel,
  Room,
} from "livekit-client";

import { LANG_NAME, MODULE_NAME } from "./utils/constants";

import LiveKitClient, { InitState } from "./LiveKitClient";
import { callWhenReady, delayReload } from "./utils/helpers";
import { LiveKitConnectionSettings } from "../types/avclient-livekit";
import LiveKitAVConfig from "./LiveKitAVConfig";
import { Logger } from "./utils/logger";
import { DeepPartial } from "fvtt-types/utils";

/**
 * Establish types that are called in the LiveKitAVClient.
 */
declare module "fvtt-types/configuration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Hooks {
    interface HookConfig {
      /**
       * The LiveKit client is available, but not yet initialized.
       */
      liveKitClientAvailable: (client: LiveKitClient) => void;
      /**
       * The LiveKit client is available and initialized. It's ready for use.
       */
      liveKitClientInitialized: (client: LiveKitClient) => void;
    }
  }
}

const log = new Logger();

if (import.meta.hot) {
  log.warn("HMR enabled for LiveKitAVClient");
  import.meta.hot.accept((module) => {
    log.warn("HMR update for LiveKitAVClient", module);
    delayReload();
  });
}

/**
 * An AVClient implementation that uses WebRTC and the LiveKit library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
export default class LiveKitAVClient extends foundry.av.AVClient {
  _liveKitClient: LiveKitClient;
  room: string | null;
  tempError: unknown;

  constructor(master: foundry.av.AVMaster, settings: foundry.av.AVSettings) {
    super(master, settings);

    this._liveKitClient = new LiveKitClient(this);
    this.room = null;
    this.master.config = new LiveKitAVConfig({ webrtc: master });
  }

  /* -------------------------------------------- */
  /*  Connection                                  */
  /* -------------------------------------------- */

  /**
   * One-time initialization actions that should be performed for this client implementation.
   * This will be called only once when the Game object is first set-up.
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    log.debug("LiveKitAVClient initialize");
    this._liveKitClient.initState = InitState.Initializing;

    if (this.settings.get("client", "voice.mode") === "activity") {
      log.debug(
        "Disabling voice activation mode as it is handled natively by LiveKit",
      );
      this.settings.set("client", "voice.mode", "always");
    }

    // Don't fully initialize if client has enabled the option to use the external web client
    if (game.settings?.get(MODULE_NAME, "useExternalAV")) {
      log.debug("useExternalAV set, not initializing LiveKitClient");
      this._liveKitClient.useExternalAV = true;

      // Broadcast ourselves as unmuted and not hidden since the client will not be handling these calls
      game.user?.broadcastActivity({
        av: { hidden: false, muted: false },
      });
    } else {
      // Initialize the room
      this._liveKitClient.initializeRoom();

      // Initialize the local tracks
      await this._liveKitClient.initializeLocalTracks();

      // Broadcast our current hidden & muted states
      game.user?.broadcastActivity({
        av: { muted: !this.isAudioEnabled(), hidden: !this.isVideoEnabled() },
      });
    }

    this._liveKitClient.initState = InitState.Initialized;
    Hooks.callAll("liveKitClientInitialized", this._liveKitClient);
  }

  /* -------------------------------------------- */

  /**
   * Connect to any servers or services needed in order to provide audio/video functionality.
   * Any parameters needed in order to establish the connection should be drawn from the settings
   * object.
   * This function should return a boolean for whether the connection attempt was successful.
   * @returns {Promise<boolean>}   Was the connection attempt successful?
   */
  async connect(): Promise<boolean> {
    log.debug("LiveKitAVClient connect");
    this._liveKitClient.connectionState = ConnectionState.Connecting;

    let liveKitConnectionSettings = game.settings?.get(
      MODULE_NAME,
      "liveKitConnectionSettings",
    );

    const legacyLiveKitConnectionSettings = this.settings.get(
      "world",
      "livekit",
    ) as LiveKitConnectionSettings | undefined;

    if (legacyLiveKitConnectionSettings) {
      log.warn("Migrating legacy livekit connection settings");
      liveKitConnectionSettings = legacyLiveKitConnectionSettings;
      callWhenReady(() => {
        game.settings
          ?.set(
            MODULE_NAME,
            "liveKitConnectionSettings",
            legacyLiveKitConnectionSettings,
          )
          .catch((error: unknown) => {
            log.error(
              "Error setting livekit connection settings from legacy value",
              error,
            );
            return;
          });
        game.webrtc?.client.settings.set("world", "livekit", undefined);
      });
    }

    // If liveKitConnectionSettings still isn't set, set it to an empty object
    liveKitConnectionSettings ??= {};

    if (liveKitConnectionSettings.serverType === undefined && game.user?.isGM) {
      // Set the initial value to the default
      log.warn(
        "livekit serverType setting not found; defaulting to",
        this._liveKitClient.defaultLiveKitServerType.key,
      );
      liveKitConnectionSettings.serverType =
        this._liveKitClient.defaultLiveKitServerType.key;
      callWhenReady(() => {
        game.settings
          .set(
            MODULE_NAME,
            "liveKitConnectionSettings",
            liveKitConnectionSettings,
          )
          .catch((error: unknown) => {
            log.error(
              "Error setting livekit serverType setting to default",
              error,
            );
          });
      });
    }

    let liveKitServerType = this._liveKitClient.defaultLiveKitServerType;
    if (
      typeof liveKitConnectionSettings.serverType === "string" &&
      this._liveKitClient.liveKitServerTypes[
        liveKitConnectionSettings.serverType
      ].tokenFunction instanceof Function
    ) {
      liveKitServerType =
        this._liveKitClient.liveKitServerTypes[
          liveKitConnectionSettings.serverType
        ];
    } else {
      log.warn(
        "liveKitServerType",
        liveKitConnectionSettings.serverType,
        "not found; defaulting to",
        this._liveKitClient.defaultLiveKitServerType.key,
      );
    }

    // Fix the URL if a protocol has been specified
    if (liveKitConnectionSettings.url) {
      const uriRegExp = new RegExp("^([a-zA-Z\\d]+://)+(.*)$");
      if (uriRegExp.exec(liveKitConnectionSettings.url)) {
        log.warn(
          "Protocol included in server URL:",
          liveKitConnectionSettings.url,
          "; removing protocol",
        );
        liveKitConnectionSettings.url = liveKitConnectionSettings.url.replace(
          uriRegExp,
          "$2",
        );
        callWhenReady(() => {
          game.settings
            ?.set(
              MODULE_NAME,
              "liveKitConnectionSettings",
              liveKitConnectionSettings,
            )
            .catch((error: unknown) => {
              log.error("Error setting livekit url setting", error);
            });
        });
      }
    }

    // Check for connection settings
    if (
      game.user?.isGM &&
      ((liveKitServerType.urlRequired &&
        (liveKitConnectionSettings.url === undefined ||
          liveKitConnectionSettings.url === "")) ||
        (liveKitServerType.usernameRequired &&
          (liveKitConnectionSettings.username === undefined ||
            liveKitConnectionSettings.username === "")) ||
        (liveKitServerType.passwordRequired &&
          (liveKitConnectionSettings.password === undefined ||
            liveKitConnectionSettings.password === "")))
    ) {
      log.error("LiveKit connection information missing");
      ui.notifications?.error(
        game.i18n.localize(`${LANG_NAME}.connectionInfoMissing`),
        { permanent: true },
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      await this.master.config.render({ force: true });
      return false;
    }

    // Check for Tavern account settings
    if (
      game.user?.isGM &&
      liveKitServerType.key === "tavern" &&
      game.settings.get(MODULE_NAME, "tavernPatreonToken") === ""
    ) {
      log.error("LiveKit Tavern connection information missing");
      ui.notifications?.error(
        game.i18n.localize(`${LANG_NAME}.tavernAccountMissing`),
        { permanent: true },
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      await this.master.config.render({ force: true });
      return false;
    }

    // Set a room name if one doesn't yet exist
    if (!liveKitConnectionSettings.room) {
      log.warn("No meeting room set, creating random name.");
      liveKitConnectionSettings.room = foundry.utils.randomID(32);
      callWhenReady(() => {
        game.settings
          ?.set(
            MODULE_NAME,
            "liveKitConnectionSettings",
            liveKitConnectionSettings,
          )
          .catch((error: unknown) => {
            log.error("Error setting livekit room setting", error);
          });
      });
    }

    // Set the room name, using breakout room if set
    if (this._liveKitClient.breakoutRoom) {
      this.room = this._liveKitClient.breakoutRoom;
    } else {
      this.room = liveKitConnectionSettings.room;
    }
    log.debug("Meeting room name:", this.room);

    // Set the user's metadata
    const metadata = JSON.stringify({
      fvttUserId: game.user?.id,
      useExternalAV: this._liveKitClient.useExternalAV,
    });

    const userName = game.user?.name;

    if (!this.room || !userName) {
      log.error(
        "Missing required room information, cannot connect. room:",
        this.room,
        "username:",
        userName,
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    const accessToken = await liveKitServerType
      .tokenFunction(
        liveKitConnectionSettings.username, // The LiveKit API Key
        liveKitConnectionSettings.password, // The LiveKit Secret Key
        this.room,
        userName,
        metadata,
      )
      .catch((error: unknown) => {
        let message = error;
        if (error instanceof Error) {
          message = error.message;
        }
        log.error(
          "An error occurred when calling tokenFunction for liveKitServerType:",
          liveKitServerType,
          message,
        );
        return "";
      });

    if (!accessToken) {
      log.error(
        "Could not get access token",
        liveKitServerType.label || liveKitServerType.key,
      );
      ui.notifications?.error(
        game.i18n?.localize(`${LANG_NAME}.tokenError`) ?? "tokenError",
        {
          permanent: true,
        },
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    const liveKitAddress = liveKitServerType.urlRequired
      ? liveKitConnectionSettings.url
      : liveKitServerType.url;

    if (typeof liveKitAddress !== "string") {
      const message = `${
        game.i18n?.localize(liveKitServerType.label) ?? "liveKitServerType"
      } doesn't provide a URL`;
      log.error(message, liveKitServerType);
      ui.notifications?.error(
        `${game.i18n?.localize(`${LANG_NAME}.connectError`) ?? "connectError"}: ${message}`,
        { permanent: true },
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // If useExternalAV is enabled, send a join message instead of connecting
    if (this._liveKitClient.useExternalAV) {
      log.debug("useExternalAV set, not connecting to LiveKit");
      await this._liveKitClient.sendJoinMessage(liveKitAddress, accessToken);
      return true;
    }

    // Set the livekit room options
    const liveKitRoomConnectOptions: RoomConnectOptions = {
      autoSubscribe: true,
    };

    if (
      game.settings?.get(MODULE_NAME, "debug") &&
      game.settings.get(MODULE_NAME, "liveKitTrace")
    ) {
      log.debug("Setting livekit trace logging");
      setLogLevel(LogLevel.trace);
    }

    // Connect to the server
    try {
      await this._liveKitClient.liveKitRoom?.connect(
        `wss://${liveKitAddress}`,
        accessToken,
        liveKitRoomConnectOptions,
      );
      log.info("Connected to room", this.room);
    } catch (error: unknown) {
      log.error("Could not connect:", error);

      let message = error;
      if (error instanceof Error) {
        message = error.message;
      }

      // Check for clock related errors
      if (
        String(message).includes("validation failed, token is expired") ||
        String(message).includes("validation failed, token not valid yet")
      ) {
        message =
          game.i18n?.localize(`${LANG_NAME}.connectErrorCheckClock`) ??
          "connectErrorCheckClock";
      }

      // Note: ReconnectManager handles post-connection disconnects.
      // Initial connection failures are shown as permanent errors below.
      ui.notifications?.error(
        `${game.i18n?.localize(`${LANG_NAME}.connectError`) ?? "connectError"}: ${String(message)}`,
        { permanent: true },
      );
      this._liveKitClient.setConnectionButtons(false);
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // Verify that we are connected
    if (
      !(this._liveKitClient.liveKitRoom?.state === ConnectionState.Connected)
    ) {
      log.error("Not connected to room after attempting to connect");
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // Set up after connection
    await this._liveKitClient.onConnected();

    this._liveKitClient.connectionState = ConnectionState.Connected;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from any servers or services which are used to provide audio/video functionality.
   * This function should return a boolean for whether a valid disconnection occurred.
   * @returns {Promise<boolean>}   Did a disconnection occur?
   */
  async disconnect(): Promise<boolean> {
    log.debug("LiveKitAVClient disconnect");

    // Check to make sure we are connected before trying to disconnect
    if (
      this._liveKitClient.liveKitRoom &&
      this._liveKitClient.liveKitRoom.state !== ConnectionState.Disconnected
    ) {
      // Disconnect from the room, but don't stop tracks in case we are reconnecting again soon
      await this._liveKitClient.liveKitRoom.disconnect(false);
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return true;
    }

    // Not currently connected
    log.warn("Not currently connected; skipping disconnect");
    this._liveKitClient.connectionState = ConnectionState.Disconnected;
    return false;
  }

  /* -------------------------------------------- */
  /*  Device Discovery                            */
  /* -------------------------------------------- */

  /**
   * Provide an Object of available audio sources which can be used by this implementation.
   * Each object key should be a device id and the key should be a human-readable label.
   * @returns {Promise<{object}>}
   */
  async getAudioSinks(): Promise<Record<string, string>> {
    return this._getSourcesOfType("audiooutput");
  }

  /* -------------------------------------------- */

  /**
   * Provide an Object of available audio sources which can be used by this implementation.
   * Each object key should be a device id and the key should be a human-readable label.
   * @returns {Promise<{object}>}
   */
  async getAudioSources(): Promise<Record<string, string>> {
    return this._getSourcesOfType("audioinput");
  }

  /* -------------------------------------------- */

  /**
   * Provide an Object of available video sources which can be used by this implementation.
   * Each object key should be a device id and the key should be a human-readable label.
   * @returns {Promise<{object}>}
   */
  async getVideoSources(): Promise<Record<string, string>> {
    return this._getSourcesOfType("videoinput");
  }

  /* -------------------------------------------- */

  /**
   * Obtain a mapping of available device sources for a given type.
   * @param {string} kind       The type of device source being requested
   * @returns {Promise<{object}>}
   * @private
   */
  async _getSourcesOfType(
    kind: MediaDeviceKind,
  ): Promise<Record<string, string>> {
    try {
      const devices = await Room.getLocalDevices(kind);
      return devices.reduce((obj: Record<string, string>, device) => {
        obj[device.deviceId] =
          (device.label || game.i18n?.localize("WEBRTC.UnknownDevice")) ??
          "UnknownDevice";
        return obj;
      }, {});
    } catch (error: unknown) {
      log.error("Could not get media devices of type", kind, "; error:", error);
      return {};
    }
  }

  /* -------------------------------------------- */
  /*  Track Manipulation                          */
  /* -------------------------------------------- */

  /**
   * Return an array of Foundry User IDs which are currently connected to A/V.
   * The current user should also be included as a connected user in addition to all peers.
   * @returns {string[]}          The connected User IDs
   */
  getConnectedUsers(): string[] {
    log.debug("getConnectedUsers");

    // If useExternalAV is enabled, return empty array
    if (game.settings?.get(MODULE_NAME, "useExternalAV")) {
      return [];
    }

    const connectedUsers: string[] = Array.from(
      this._liveKitClient.liveKitParticipants.keys(),
    );

    // If we aren't connected, still return our own ID so our video window is shown
    if (connectedUsers.length === 0) {
      log.debug("No connected users; adding our own user id");
      const userId = game.user?.id;
      if (userId) {
        connectedUsers.push(userId);
      }
    }

    log.debug("connectedUsers:", connectedUsers);
    return connectedUsers;
  }

  /* -------------------------------------------- */

  /**
   * Provide a MediaStream instance for a given user ID
   * @param {string} userId        The User id
   * @returns {MediaStream|null}   The MediaStream for the user, or null if the user does not have one
   */
  getMediaStreamForUser(userId: string): MediaStream | null {
    log.debug(
      "getMediaStreamForUser called for",
      userId,
      "but is not used with",
      MODULE_NAME,
    );
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Provide a MediaStream for monitoring a given user's voice volume levels.
   * @param {string} userId       The User ID.
   * @returns {MediaStream|null}  The MediaStream for the user, or null if the user does not have one.
   */
  getLevelsStreamForUser(userId: string): MediaStream | null {
    log.debug(
      "getLevelsStreamForUser called for",
      userId,
      "but is not used with",
      MODULE_NAME,
    );
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound audio enabled for the current user?
   * @returns {boolean}
   */
  isAudioEnabled(): boolean {
    return !!this._liveKitClient.audioTrack;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound video enabled for the current user?
   * @returns {boolean}
   */
  isVideoEnabled(): boolean {
    return !!this._liveKitClient.videoTrack;
  }

  /* -------------------------------------------- */

  /**
   * Set whether the outbound audio feed for the current game user is enabled.
   * This method should be used when the user marks themselves as muted or if the gamemaster
   * globally mutes them.
   * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
   *                                 disabled (false)
   */
  toggleAudio(enable: boolean): void {
    log.debug("Toggling audio:", enable);

    // If useExternalAV is enabled, return
    if (this._liveKitClient.useExternalAV) {
      return;
    }

    // If "always on" broadcasting is not enabled, don't proceed
    if (!this._liveKitClient.audioBroadcastEnabled || this.isVoicePTT) return;

    // Enable active broadcasting
    this.toggleBroadcast(enable);
  }

  /* -------------------------------------------- */

  /**
   * Set whether the outbound audio feed for the current game user is actively broadcasting.
   * This can only be true if audio is enabled, but may be false if using push-to-talk or voice
   * activation modes.
   * @param {boolean} broadcast     Whether outbound audio should be sent to connected peers or not?
   */
  toggleBroadcast(broadcast: boolean): void {
    log.debug("Toggling broadcast audio:", broadcast);

    // If useExternalAV is enabled, return
    if (this._liveKitClient.useExternalAV) {
      return;
    }

    this._liveKitClient.audioBroadcastEnabled = broadcast;
    this._liveKitClient.setAudioEnabledState(broadcast);
  }

  /* -------------------------------------------- */

  /**
   * Set whether the outbound video feed for the current game user is enabled.
   * This method should be used when the user marks themselves as hidden or if the gamemaster
   * globally hides them.
   * @param {boolean} enable        Whether the outbound video track should be enabled (true) or
   *                                 disabled (false)
   */
  toggleVideo(enable: boolean): void {
    // If useExternalAV is enabled, return
    if (this._liveKitClient.useExternalAV) {
      return;
    }

    if (!this._liveKitClient.videoTrack) {
      log.debug("toggleVideo called but no video track available");
      return;
    }

    if (!enable) {
      log.debug("Muting video track", this._liveKitClient.videoTrack);
      this._liveKitClient.videoTrack.mute().catch((error: unknown) => {
        log.error("Error muting video track:", error);
      });
    } else {
      // Ensure the video track is published to avoid an error when un-muting an unpublished track
      if (
        !this._liveKitClient.videoTrack.sid ||
        !this._liveKitClient.liveKitRoom?.localParticipant.videoTrackPublications.has(
          this._liveKitClient.videoTrack.sid,
        )
      ) {
        log.debug("toggleVideo unmute called but video track is not published");
        return;
      }

      log.debug("Un-muting video track", this._liveKitClient.videoTrack);
      this._liveKitClient.videoTrack.unmute().catch((error: unknown) => {
        log.error("Error un-muting video track:", error);
      });
    }
    this.master.render();
  }

  /* -------------------------------------------- */

  /**
   * Set the Video Track for a given User ID to a provided VideoElement
   * @param {string} userId                   The User ID to set to the element
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement to which the video should be set
   */
  async setUserVideo(
    userId: string,
    videoElement: HTMLVideoElement,
  ): Promise<void> {
    log.debug("Setting video element:", videoElement, "for user:", userId);

    // If this is for our local user, attach our video track using LiveKit
    if (userId === game.user?.id) {
      // Attach only our video track
      const userVideoTrack = this._liveKitClient.videoTrack;
      if (userVideoTrack) {
        this._liveKitClient.attachVideoTrack(userVideoTrack, videoElement);
      }

      // Add connection quality indicator
      this._liveKitClient.addConnectionQualityIndicator(userId);
      return;
    }

    // Make sure the room is active first
    if (!this._liveKitClient.liveKitRoom) {
      log.warn("Attempted to set user video with no active room; skipping");
      return;
    }

    // For all other users, get their video and audio tracks
    const userAudioTrack = this._liveKitClient.getUserAudioTrack(userId);
    const userVideoTrack = this._liveKitClient.getUserVideoTrack(userId);

    // Add the video for the user
    if (userVideoTrack) {
      this._liveKitClient.attachVideoTrack(userVideoTrack, videoElement);
    }

    // Get the audio element for the user
    if (userAudioTrack instanceof RemoteAudioTrack) {
      const audioElement = this._liveKitClient.getUserAudioElement(
        userId,
        videoElement,
        userAudioTrack.source,
      );

      // Add the audio for the user
      if (audioElement) {
        await this._liveKitClient.attachAudioTrack(
          userId,
          userAudioTrack,
          audioElement,
        );
      }
    }

    // Add connection quality indicator
    this._liveKitClient.addConnectionQualityIndicator(userId);

    const event = new CustomEvent("webrtcVideoSet", { detail: userId });
    videoElement.dispatchEvent(event);
  }

  /* -------------------------------------------- */
  /*  Settings and Configuration                  */
  /* -------------------------------------------- */

  /**
   * Handle changes to A/V configuration settings.
   * @param {object} changed      The settings which have changed
   */
  onSettingsChanged(
    changed: DeepPartial<foundry.av.AVSettings.Settings>,
  ): void {
    log.debug("onSettingsChanged:", changed);
    const keys = new Set(Object.keys(foundry.utils.flattenObject(changed)));

    // Change audio source
    const audioSourceChange = keys.has("client.audioSrc");
    if (audioSourceChange)
      this._liveKitClient.changeAudioSource().catch((error: unknown) => {
        log.error("Error changing audio source:", error);
      });

    // Change video source
    const videoSourceChange = keys.has("client.videoSrc");
    if (videoSourceChange)
      this._liveKitClient.changeVideoSource().catch((error: unknown) => {
        log.error("Error changing video source:", error);
      });

    // Change voice broadcasting mode
    const modeChange = [
      "client.voice.mode",
      `client.users.${game.user?.id ?? ""}.muted`,
    ].some((k) => keys.has(k));
    if (modeChange) {
      const isAlways = this.settings.client.voice.mode === "always";
      this.toggleAudio(
        isAlways && this.master.canUserShareAudio(game.user?.id ?? ""),
      );
      this.master.broadcast(isAlways);
    }

    // Re-render the AV camera view
    const renderChange = [
      "client.audioSink",
      "client.muteAll",
      "client.disableVideo",
      "client.nameplates",
    ].some((k) => keys.has(k));
    if (audioSourceChange || videoSourceChange || renderChange)
      this.master.render();

    // Refresh the main settings page if it is open, in case one of our settings has changed
    if (game.settings?.sheet.rendered) {
      game.settings.sheet.render().catch((error: unknown) => {
        log.error("Error rendering settings sheet:", error);
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Replace the local stream for each connected peer with a re-generated MediaStream.
   */
  async updateLocalStream(): Promise<void> {
    log.debug("updateLocalStream");
    await this._liveKitClient.changeAudioSource();
    await this._liveKitClient.changeVideoSource();
  }
}
