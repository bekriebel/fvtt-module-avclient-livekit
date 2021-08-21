import {
  connect as liveKitConnect,
  LogLevel,
  RoomState,
} from "livekit-client";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import * as log from "./utils/logging";

import LiveKitClient from "./LiveKitClient";
import { getGame } from "./utils/helpers";

/**
 * An AVClient implementation that uses WebRTC and the LiveKit library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
export default class LiveKitAVClient extends AVClient {
  room: any;
  _liveKitClient: any;
  audioBroadcastEnabled: boolean;

  constructor(master, settings) {
    super(master, settings);

    this._liveKitClient = new LiveKitClient(this);
    this.audioBroadcastEnabled = false;
    this.room = null;
  }

  /* -------------------------------------------- */

  /**
   * Is audio broadcasting push-to-talk enabled?
   * @returns {boolean}
   */
  get isVoicePTT() {
    return this.settings.client.voice.mode === "ptt";
  }

  /**
   * Is audio broadcasting always enabled?
   * @returns {boolean}
   */
  get isVoiceAlways() {
    return this.settings.client.voice.mode === "always";
  }

  /**
   * Is audio broadcasting voice-activation enabled?
   * @returns {boolean}
   */
  get isVoiceActivated() {
    return this.settings.client.voice.mode === "activity";
  }

  /**
   * Is the current user muted?
   * @returns {boolean}
   */
  get isMuted() {
    return this.settings.client.users[getGame().user?.id || ""]?.muted;
  }

  /* -------------------------------------------- */
  /*  Connection                                  */
  /* -------------------------------------------- */

  /**
   * One-time initialization actions that should be performed for this client implementation.
   * This will be called only once when the Game object is first set-up.
   * @return {Promise<void>}
   */
  async initialize() {
    log.debug("LiveKitAVClient initialize");

    if (this.settings.get("client", "voice.mode") === "activity") {
      log.debug("Disabling voice activation mode as it is handled natively by LiveKit");
      this.settings.set("client", "voice.mode", "always");
    }

    await this._liveKitClient.initializeLocalTracks();
  }

  /* -------------------------------------------- */

  /**
   * Connect to any servers or services needed in order to provide audio/video functionality.
   * Any parameters needed in order to establish the connection should be drawn from the settings
   * object.
   * This function should return a boolean for whether the connection attempt was successful.
   * @return {Promise<boolean>}   Was the connection attempt successful?
   */
  async connect() {
    log.debug("LiveKitAVClient connect");

    const connectionSettings:any = this.settings.get("world", "server");

    // Set a room name if one doesn't yet exist
    if (!connectionSettings.room) {
      log.warn("No meeting room set, creating random name.");
      this.settings.set("world", "server.room", randomID(32));
    }

    // Set the room name
    this.room = connectionSettings.room;
    log.debug("Meeting room name:", this.room);

    // Set the user's metadata
    const metadata = {
      fvttUserId: getGame().user?.id,
    };

    // Get an access token
    const accessToken = this._liveKitClient.getAccessToken(
      connectionSettings.username,
      connectionSettings.password,
      this.room,
      getGame().user?.name,
      metadata,
    );

    const localTracks:any = [];
    if (this._liveKitClient.audioTrack) localTracks.push(this._liveKitClient.audioTrack);
    if (this._liveKitClient.videoTrack) localTracks.push(this._liveKitClient.videoTrack);

    // Set the livekit connection options
    const livekitConnectionOptions:any = {
      tracks: localTracks,
    };

    if (getGame().settings.get(MODULE_NAME, "livekitTrace")) {
      log.debug("Setting livekit trace logging");
      livekitConnectionOptions.logLevel = LogLevel.trace;
    }

    // Connect to the server
    try {
      this._liveKitClient.liveKitRoom = await liveKitConnect(
        `wss://${connectionSettings.url}`,
        accessToken,
        livekitConnectionOptions,
      );
      log.info("Connected to room", this.room);
    } catch (error) {
      log.error("Could not connect:", error.message);
      // TODO: Add some incremental back-off reconnect logic here
      ui.notifications?.error(`${getGame().i18n.localize(`${LANG_NAME}.connectError`)}: ${error.message}`);
      this._liveKitClient.setConnectionButtons(false);
      return false;
    }

    // Verify that we are connected
    if (!(this._liveKitClient.liveKitRoom?.state === RoomState.Connected)) {
      log.error("Not connected to room after attempting to connect");
      return false;
    }

    // Set up after connection
    this._liveKitClient.onConnected();

    return true;
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from any servers or services which are used to provide audio/video functionality.
   * This function should return a boolean for whether a valid disconnection occurred.
   * @return {Promise<boolean>}   Did a disconnection occur?
   */
  async disconnect() {
    log.debug("LiveKitAVClient disconnect");
    if (this._liveKitClient.liveKitRoom
      && this._liveKitClient.liveKitRoom.state !== RoomState.Disconnected) {
      this._liveKitClient.liveKitRoom.disconnect();
      return true;
    }

    // Not currently connected
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
  async getAudioSinks() {
    return this._getSourcesOfType("audiooutput");
  }

  /* -------------------------------------------- */

  /**
   * Provide an Object of available audio sources which can be used by this implementation.
   * Each object key should be a device id and the key should be a human-readable label.
   * @returns {Promise<{object}>}
   */
  async getAudioSources() {
    return this._getSourcesOfType("audioinput");
  }

  /* -------------------------------------------- */

  /**
   * Provide an Object of available video sources which can be used by this implementation.
   * Each object key should be a device id and the key should be a human-readable label.
   * @returns {Promise<{object}>}
   */
  async getVideoSources() {
    return this._getSourcesOfType("videoinput");
  }

  /* -------------------------------------------- */

  /**
   * Obtain a mapping of available device sources for a given type.
   * @param {string} kind       The type of device source being requested
   * @returns {Promise<{object}>}
   * @private
   */
  async _getSourcesOfType(kind) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.reduce((obj, device) => {
      if (device.kind === kind) {
        obj[device.deviceId] = device.label || getGame().i18n.localize("WEBRTC.UnknownDevice");
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
  getConnectedUsers() {
    const connectedUsers:string[] = Array.from(this._liveKitClient.liveKitParticipants.keys());

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
  getMediaStreamForUser() {
    log.debug("getMediaStreamForUser called but is not used with", MODULE_NAME);
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound audio enabled for the current user?
   * @return {boolean}
   */
  isAudioEnabled() {
    return this.audioBroadcastEnabled;
  }

  /* -------------------------------------------- */

  /**
   * Is outbound video enabled for the current user?
   * @return {boolean}
   */
  isVideoEnabled() {
    let videoTrackEnabled = false;
    if (this._liveKitClient.videoTrack && !this._liveKitClient.videoTrack.isMuted) {
      videoTrackEnabled = true;
    }
    return videoTrackEnabled;
  }

  /* -------------------------------------------- */

  /**
   * Set whether the outbound audio feed for the current game user is enabled.
   * This method should be used when the user marks themselves as muted or if the gamemaster
   * globally mutes them.
   * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
   *                                 disabled (false)
   */
  toggleAudio(enable) {
    log.debug("Toggling audio:", enable);

    // If "always on" broadcasting is not enabled, don't proceed
    if (!this.audioBroadcastEnabled || this.isVoicePTT) return;

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
  toggleBroadcast(broadcast) {
    log.debug("Toggling broadcast audio:", broadcast);

    this.audioBroadcastEnabled = broadcast;
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
  toggleVideo(enable) {
    if (!this._liveKitClient.videoTrack) {
      log.debug("toggleVideo called but no video track available");
      return;
    }

    if (!enable) {
      log.debug("Muting video track", this._liveKitClient.videoTrack);
      this._liveKitClient.videoTrack.mute();
    } else {
      log.debug("Un-muting video track", this._liveKitClient.videoTrack);
      this._liveKitClient.videoTrack.unmute();
    }
  }

  /* -------------------------------------------- */

  /**
   * Set the Video Track for a given User ID to a provided VideoElement
   * @param {string} userId                   The User ID to set to the element
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement to which the video should be set
   */
  async setUserVideo(userId, videoElement) {
    log.debug("Setting video element:", videoElement, "for user:", userId);

    // Make sure the room is active first
    if (!this._liveKitClient.liveKitRoom) {
      log.warn("Attempted to set user video with no active room; skipping");
      return;
    }

    // If this if for our local user, attach our video track using LiveKit
    if (userId === getGame().user?.id) {
      // Attach only our video track
      const userVideoTrack = this._liveKitClient.videoTrack;
      if (userVideoTrack && videoElement) {
        this._liveKitClient.attachVideoTrack(userVideoTrack, videoElement);
      }
      return;
    }

    // For all other users, get their video and audio tracks
    const userAudioTrack = this._liveKitClient.getParticipantAudioTrack(userId);
    const userVideoTrack = this._liveKitClient.getParticipantVideoTrack(userId);

    // Add the video for the user
    if (userVideoTrack) {
      this._liveKitClient.attachVideoTrack(userVideoTrack, videoElement);
    }

    // Get the audio element for the user
    const audioElement = this._liveKitClient.getUserAudioElement(userId, videoElement);

    // Add the audio for the user
    if (userAudioTrack && audioElement) {
      this._liveKitClient.attachAudioTrack(userId, userAudioTrack, audioElement);
    }

    // Add status indicators
    this._liveKitClient.addStatusIndicators(userId);

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
  onSettingsChanged(changed) {
    log.debug("onSettingsChanged:", changed);
    const keys = new Set(Object.keys(foundry.utils.flattenObject(changed)));

    // Change audio source
    const audioSourceChange = ["client.audioSrc"].some((k) => keys.has(k));
    if (audioSourceChange) this._liveKitClient.changeAudioSource(changed.client.audioSrc);

    // Change video source
    const videoSourceChange = ["client.videoSrc"].some((k) => keys.has(k));
    if (videoSourceChange) this._liveKitClient.changeVideoSource(changed.client.videoSrc);

    // Change voice broadcasting mode
    const modeChange = ["client.voice.mode", `client.users.${getGame().user?.id}.muted`].some((k) => keys.has(k));
    if (modeChange) {
      const isAlways = this.settings.client.voice.mode === "always";
      this.toggleAudio(isAlways && this.master.canUserShareAudio(getGame().user?.id || ""));
      this.master.broadcast(isAlways);
    }

    // Re-render the AV camera view
    const renderChange = ["client.audioSink", "client.muteAll"].some((k) => keys.has(k));
    if (audioSourceChange || videoSourceChange || renderChange) this.master.render();
  }
}
