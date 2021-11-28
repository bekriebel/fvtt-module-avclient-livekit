import {
  connect as liveKitConnect,
  ConnectOptions,
  LogLevel,
  RemoteAudioTrack,
  RoomState,
  TrackPublishDefaults,
  VideoPresets43,
} from "livekit-client";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import * as log from "./utils/logging";

import LiveKitClient, { ConnectionState, InitState } from "./LiveKitClient";
import { getGame } from "./utils/helpers";
import { ConnectionSettings } from "../types/avclient-livekit";
import LiveKitAVConfig from "./LiveKitAVConfig";

/**
 * An AVClient implementation that uses WebRTC and the LiveKit library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
export default class LiveKitAVClient extends AVClient {
  _liveKitClient: LiveKitClient;
  room: string | null;
  tempError: unknown;

  constructor(master: AVMaster, settings: AVSettings) {
    super(master, settings);

    this._liveKitClient = new LiveKitClient(this);
    this.room = null;
    this.master.config = new LiveKitAVConfig(master);
  }

  /* -------------------------------------------- */

  /**
   * Is audio broadcasting push-to-talk enabled?
   * @returns {boolean}
   */
  get isVoicePTT(): boolean {
    return this.settings.client.voice.mode === "ptt";
  }

  /**
   * Is audio broadcasting always enabled?
   * @returns {boolean}
   */
  get isVoiceAlways(): boolean {
    return this.settings.client.voice.mode === "always";
  }

  /**
   * Is audio broadcasting voice-activation enabled?
   * @returns {boolean}
   */
  get isVoiceActivated(): boolean {
    // This module does not allow for voice activation
    return false;
  }

  /**
   * Is the current user muted?
   * @returns {boolean}
   */
  get isMuted(): boolean {
    return this.settings.client.users[getGame().user?.id || ""]?.muted || false;
  }

  /* -------------------------------------------- */
  /*  Connection                                  */
  /* -------------------------------------------- */

  /**
   * One-time initialization actions that should be performed for this client implementation.
   * This will be called only once when the Game object is first set-up.
   * @return {Promise<void>}
   */
  async initialize(): Promise<void> {
    log.debug("LiveKitAVClient initialize");
    this._liveKitClient.initState = InitState.Initializing;

    if (this.settings.get("client", "voice.mode") === "activity") {
      log.debug(
        "Disabling voice activation mode as it is handled natively by LiveKit"
      );
      this.settings.set("client", "voice.mode", "always");
    }

    // Don't fully initialize if client has enabled the option to use the external web client
    if (getGame().settings.get(MODULE_NAME, "useExternalAV")) {
      log.debug("useExternalAV set, not initializing LiveKitClient");
      this._liveKitClient.useExternalAV = true;
      this._liveKitClient.initState = InitState.Initialized;
      return;
    }

    await this._liveKitClient.initializeLocalTracks();
    this._liveKitClient.initState = InitState.Initialized;
  }

  /* -------------------------------------------- */

  /**
   * Connect to any servers or services needed in order to provide audio/video functionality.
   * Any parameters needed in order to establish the connection should be drawn from the settings
   * object.
   * This function should return a boolean for whether the connection attempt was successful.
   * @return {Promise<boolean>}   Was the connection attempt successful?
   */
  async connect(): Promise<boolean> {
    log.debug("LiveKitAVClient connect");
    this._liveKitClient.connectionState = ConnectionState.Connecting;

    const connectionSettings = this.settings.get(
      "world",
      "server"
    ) as ConnectionSettings;

    // Force connection type to custom
    if (connectionSettings.type !== "custom" && getGame().user?.isGM) {
      this.settings.set("world", "server.type", "custom");
      // For versions before v9, return immediate since a reconnect will occur
      if (!this._liveKitClient.isVersion9) {
        return false;
      }
    }

    if (
      getGame().user?.isGM &&
      (connectionSettings.url === "" ||
        connectionSettings.url === "" ||
        connectionSettings.password === "")
    ) {
      this.master.config.render(true);
      log.error("LiveKit connection information missing");
      ui.notifications?.error(
        `${getGame().i18n.localize(`${LANG_NAME}.connectionInfoMissing`)}`,
        { permanent: true }
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // Set a room name if one doesn't yet exist
    if (!connectionSettings.room) {
      log.warn("No meeting room set, creating random name.");
      this.settings.set("world", "server.room", randomID(32));
    }

    // Set the room name, using breakout room if set
    if (this._liveKitClient.breakoutRoom) {
      this.room = this._liveKitClient.breakoutRoom;
    } else {
      this.room = connectionSettings.room;
    }
    log.debug("Meeting room name:", this.room);

    // Set the user's metadata
    const metadata = JSON.stringify({
      fvttUserId: getGame().user?.id,
    });

    const userName = getGame().user?.name;

    if (!this.room || !userName) {
      log.error(
        "Missing required room information, cannot connect. room:",
        this.room,
        "username:",
        userName
      );
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // Get an access token
    const accessToken = this._liveKitClient.getAccessToken(
      connectionSettings.username,
      connectionSettings.password,
      this.room,
      userName,
      metadata
    );

    // If useExternalAV is enabled, send a join message instead of connecting
    if (this._liveKitClient.useExternalAV) {
      log.debug("useExternalAV set, not connecting to LiveKit");
      this._liveKitClient.sendJoinMessage(connectionSettings.url, accessToken);
      return true;
    }

    // set the LiveKit publish defaults
    const liveKitPublishDefaults: TrackPublishDefaults = {
      videoEncoding: VideoPresets43.vga.encoding,
      simulcast: getGame().settings.get(MODULE_NAME, "simulcast") === true,
    };

    // Set the livekit connection options
    const liveKitConnectionOptions: ConnectOptions = {
      autoSubscribe: true,
      publishDefaults: liveKitPublishDefaults,
    };

    // Get disable audio/video settings
    const disableReceivingAudio = getGame().settings.get(
      MODULE_NAME,
      "disableReceivingAudio"
    );
    const disableReceivingVideo = getGame().settings.get(
      MODULE_NAME,
      "disableReceivingVideo"
    );

    // Don't auto subscribe to tracks if either video or audio is disabled
    if (disableReceivingAudio || disableReceivingVideo) {
      liveKitConnectionOptions.autoSubscribe = false;

      // Send UI notifications
      if (disableReceivingAudio) {
        ui.notifications?.info(
          `${getGame().i18n.localize(
            `${LANG_NAME}.disableReceivingAudioWarning`
          )}`
        );
      }
      if (disableReceivingVideo) {
        ui.notifications?.info(
          `${getGame().i18n.localize(
            `${LANG_NAME}.disableReceivingVideoWarning`
          )}`
        );
      }
    }

    if (
      getGame().settings.get(MODULE_NAME, "debug") &&
      getGame().settings.get(MODULE_NAME, "liveKitTrace")
    ) {
      log.debug("Setting livekit trace logging");
      liveKitConnectionOptions.logLevel = LogLevel.trace;
    }

    // Connect to the server
    try {
      this._liveKitClient.liveKitRoom = await liveKitConnect(
        `wss://${connectionSettings.url}`,
        accessToken,
        liveKitConnectionOptions
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
        message = `${getGame().i18n.localize(
          `${LANG_NAME}.connectErrorCheckClock`
        )}`;
      }

      // TODO: Add some incremental back-off reconnect logic here
      ui.notifications?.error(
        `${getGame().i18n.localize(`${LANG_NAME}.connectError`)}: ${message}`,
        { permanent: true }
      );
      this._liveKitClient.setConnectionButtons(false);
      this._liveKitClient.connectionState = ConnectionState.Disconnected;
      return false;
    }

    // Verify that we are connected
    if (!(this._liveKitClient.liveKitRoom?.state === RoomState.Connected)) {
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
   * @return {Promise<boolean>}   Did a disconnection occur?
   */
  async disconnect(): Promise<boolean> {
    log.debug("LiveKitAVClient disconnect");

    // Check to make sure we are connected before trying to disconnect
    if (
      this._liveKitClient.liveKitRoom &&
      this._liveKitClient.liveKitRoom.state !== RoomState.Disconnected
    ) {
      // Disconnect from the room, but don't stop tracks in case we are reconnecting again soon
      this._liveKitClient.liveKitRoom.disconnect(false);
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
    kind: MediaDeviceKind
  ): Promise<Record<string, string>> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.reduce((obj: Record<string, string>, device) => {
      if (device.kind === kind) {
        obj[device.deviceId] =
          device.label || getGame().i18n.localize("WEBRTC.UnknownDevice");
      }
      return obj;
    }, {});
  }

  /* -------------------------------------------- */
  /*  Track Manipulation                          */
  /* -------------------------------------------- */

  /**
   * Return an array of Foundry User IDs which are currently connected to A/V.
   * The current user should also be included as a connected user in addition to all peers.
   * @return {string[]}           The connected User IDs
   */
  getConnectedUsers(): string[] {
    log.debug("getConnectedUsers");

    // If useExternalAV is enabled, return empty array
    if (getGame().settings.get(MODULE_NAME, "useExternalAV")) {
      return [];
    }

    const connectedUsers: string[] = Array.from(
      this._liveKitClient.liveKitParticipants.keys()
    );

    // If we aren't connected, still return our own ID so our video window is shown
    if (connectedUsers.length === 0) {
      log.debug("No connected users; adding our own user id");
      const userId = getGame().user?.id;
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
   * @return {MediaStream|null}    The MediaStream for the user, or null if the user does not have
   *                                one
   */
  getMediaStreamForUser(userId: string): MediaStream | null {
    log.debug(
      "getMediaStreamForUser called for",
      userId,
      "but is not used with",
      MODULE_NAME
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
      MODULE_NAME
    );
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound audio enabled for the current user?
   * @return {boolean}
   */
  isAudioEnabled(): boolean {
    return !!this._liveKitClient.audioTrack;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound video enabled for the current user?
   * @return {boolean}
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
      this._liveKitClient.videoTrack.mute();
    } else {
      // Ensure the video track is published to avoid an error when un-muting an unpublished track
      if (
        !this._liveKitClient.videoTrack.sid ||
        !this._liveKitClient.liveKitRoom?.localParticipant.videoTracks.has(
          this._liveKitClient.videoTrack.sid
        )
      ) {
        log.debug("toggleVideo unmute called but video track is not published");
        return;
      }

      log.debug("Un-muting video track", this._liveKitClient.videoTrack);
      this._liveKitClient.videoTrack.unmute();
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
    videoElement: HTMLVideoElement
  ): Promise<void> {
    log.debug("Setting video element:", videoElement, "for user:", userId);

    // If this is for our local user, attach our video track using LiveKit
    if (userId === getGame().user?.id) {
      // Attach only our video track
      const userVideoTrack = this._liveKitClient.videoTrack;
      if (userVideoTrack && videoElement) {
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
        userAudioTrack.source
      );

      // Add the audio for the user
      if (audioElement) {
        this._liveKitClient.attachAudioTrack(
          userId,
          userAudioTrack,
          audioElement
        );
      }
    }

    // Add status indicators
    this._liveKitClient.addStatusIndicators(userId);

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
  onSettingsChanged(changed: DeepPartial<AVSettings.Settings>): void {
    log.debug("onSettingsChanged:", changed);
    const keys = new Set(Object.keys(foundry.utils.flattenObject(changed)));

    // Change in the server configuration; reconnect
    const serverChange = [
      "world.server.url",
      "world.server.username",
      "world.server.password",
      "world.server.room",
    ].some((k) => keys.has(k));
    if (serverChange) {
      this.master.connect();
    }

    // Change audio source
    const audioSourceChange = keys.has("client.audioSrc");
    if (audioSourceChange) this._liveKitClient.changeAudioSource();

    // Change video source
    const videoSourceChange = keys.has("client.videoSrc");
    if (videoSourceChange) this._liveKitClient.changeVideoSource();

    // Change voice broadcasting mode
    const modeChange = [
      "client.voice.mode",
      `client.users.${getGame().user?.id}.muted`,
    ].some((k) => keys.has(k));
    if (modeChange) {
      const isAlways = this.settings.client.voice.mode === "always";
      this.toggleAudio(
        isAlways && this.master.canUserShareAudio(getGame().user?.id || "")
      );
      this.master.broadcast(isAlways);
    }

    // Re-render the AV camera view
    const renderChange = ["client.audioSink", "client.muteAll"].some((k) =>
      keys.has(k)
    );
    if (audioSourceChange || videoSourceChange || renderChange)
      this.master.render();
  }

  /* -------------------------------------------- */

  /**
   * Replace the local stream for each connected peer with a re-generated MediaStream
   * @returns {Promise<Array>} (Really returns {Promise<void>})
   */
  async updateLocalStream(): Promise<void> {
    log.debug("updateLocalStream");
    await this._liveKitClient.changeAudioSource();
    await this._liveKitClient.changeVideoSource();
  }
}
