import {
  AudioCaptureOptions,
  ConnectionQuality,
  createLocalAudioTrack,
  createLocalScreenTracks,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Participant,
  ParticipantEvent,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  RoomOptions,
  ConnectionState,
  Track,
  TrackPublication,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoPresets43,
  VideoTrack,
} from "livekit-client";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import * as jwt from "jsonwebtoken";
import * as log from "./utils/logging";
import { getGame } from "./utils/helpers";
import LiveKitAVClient from "./LiveKitAVClient";
import {
  LiveKitServerType,
  LiveKitServerTypes,
  SocketMessage,
} from "../types/avclient-livekit";
import { addContextOptions, breakout } from "./LiveKitBreakout";

export enum InitState {
  Uninitialized = "uninitialized",
  Initializing = "initializing",
  Initialized = "initialized",
}

export default class LiveKitClient {
  avMaster: AVMaster;
  liveKitAvClient: LiveKitAVClient;
  settings: AVSettings;
  render: () => void;

  audioBroadcastEnabled = false;
  audioTrack: LocalAudioTrack | null = null;
  breakoutRoom: string | null = null;
  connectionState: ConnectionState = ConnectionState.Disconnected;
  initState: InitState = InitState.Uninitialized;
  liveKitParticipants: Map<string, Participant> = new Map();
  liveKitRoom: Room | null = null;
  screenTracks: LocalTrack[] = [];
  useExternalAV = false;
  videoTrack: LocalVideoTrack | null = null;
  windowClickListener: EventListener | null = null;

  // Is the FVTT server version 9. TODO: Remove if we drop support for lower versions
  isVersion9: boolean = isNewerVersion(
    getGame().version || getGame().data.version || 0,
    "9.224"
  );

  liveKitServerTypes: LiveKitServerTypes = {
    custom: {
      key: "custom",
      label: `${LANG_NAME}.serverTypeCustom`,
      urlRequired: true,
      usernameRequired: true,
      passwordRequired: true,
      tokenFunction: this.getAccessToken,
    },
    tavern: {
      key: "tavern",
      label: `${LANG_NAME}.serverTypeTavern`,
      url: "livekit.tavern.at",
      urlRequired: false,
      usernameRequired: true,
      passwordRequired: true,
      tokenFunction: this.getAccessToken,
    },
  };

  defaultLiveKitServerType = this.liveKitServerTypes.custom;

  constructor(liveKitAvClient: LiveKitAVClient) {
    this.avMaster = liveKitAvClient.master;
    this.liveKitAvClient = liveKitAvClient;
    this.settings = liveKitAvClient.settings;

    this.render = debounce(
      this.avMaster.render.bind(this.liveKitAvClient),
      2000
    );
  }

  /* -------------------------------------------- */
  /*  LiveKit Internal methods                */
  /* -------------------------------------------- */

  addAllParticipants(): void {
    if (!this.liveKitRoom) {
      log.warn(
        "Attempting to add participants before the LiveKit room is available"
      );
      return;
    }

    // Add our user to the participants list
    const userId = getGame().user?.id;
    if (userId) {
      this.liveKitParticipants.set(userId, this.liveKitRoom.localParticipant);
    }

    // Set up all other users
    this.liveKitRoom.participants.forEach((participant: RemoteParticipant) => {
      this.onParticipantConnected(participant);
    });
  }

  addConnectionButtons(element: JQuery<HTMLElement>): void {
    // If useExternalAV is enabled, return
    if (this.useExternalAV) {
      return;
    }

    if (element.length !== 1) {
      log.warn("Can't find CameraView configure element", element);
      return;
    }

    const connectButton = $(
      `<a class="av-control toggle livekit-control connect hidden" title="${getGame().i18n.localize(
        `${LANG_NAME}.connect`
      )}"><i class="fas fa-toggle-off"></i></a>`
    );
    connectButton.on("click", () => {
      connectButton.toggleClass("disabled", true);
      this.avMaster.connect();
    });
    element.before(connectButton);

    const disconnectButton = $(
      `<a class="av-control toggle livekit-control disconnect hidden" title="${getGame().i18n.localize(
        `${LANG_NAME}.disconnect`
      )}"><i class="fas fa-toggle-on"></i></a>`
    );
    disconnectButton.on("click", () => {
      disconnectButton.toggleClass("disabled", true);
      this.avMaster.disconnect().then(() => this.render());
    });
    element.before(disconnectButton);

    if (this.liveKitRoom?.state === ConnectionState.Connected) {
      disconnectButton.toggleClass("hidden", false);
    } else {
      connectButton.toggleClass("hidden", false);
    }
  }

  addConnectionQualityIndicator(userId: string): void {
    if (!getGame().settings.get(MODULE_NAME, "displayConnectionQuality")) {
      // Connection quality indicator is not enabled
      return;
    }

    // Get the user camera view and player name bar
    const userCameraView = ui.webrtc?.getUserCameraView(userId);
    const userNameBar = userCameraView?.querySelector(".player-name");

    if (userCameraView?.querySelector(".connection-quality-indicator")) {
      // Connection quality indicator already exists
      return;
    }

    const connectionQualityIndicator = $(
      `<span class="connection-quality-indicator unknown" title="${getGame().i18n.localize(
        `${LANG_NAME}.connectionQuality.${ConnectionQuality.Unknown}`
      )}">`
    );

    if (userNameBar instanceof Element) {
      $(userNameBar).prepend(connectionQualityIndicator);
    }

    this.setConnectionQualityIndicator(userId);
  }

  addLiveKitServerType(liveKitServerType: LiveKitServerType): boolean {
    if (!this.isLiveKitServerType(liveKitServerType)) {
      log.error(
        "Attempted to add a LiveKitServerType that does not meet the requirements:",
        liveKitServerType
      );
      return false;
    }
    if (this.liveKitServerTypes[liveKitServerType.key] !== undefined) {
      log.error(
        "Attempted to add a LiveKitServerType with a key that already exists:",
        liveKitServerType
      );
      return false;
    }
    this.liveKitServerTypes[liveKitServerType.key] = liveKitServerType;
    return true;
  }

  addStatusIndicators(userId: string): void {
    if (this.isVersion9) {
      // This is no longer needed in v9
      return;
    }

    // Get the user camera view and notification bar
    const userCameraView = ui.webrtc?.getUserCameraView(userId);
    const userNotificationBar =
      userCameraView?.querySelector(".notification-bar");

    // Add indicators
    const indicators = {
      ptt: $(
        `<i class="fas fa-podcast fa-fw status-remote-ptt hidden" title="${getGame().i18n.localize(
          "WEBRTC.VoiceModePtt"
        )}"></i>`
      ),
      muted: $(
        `<i class="fas fa-microphone-alt-slash fa-fw status-remote-muted hidden" title="${getGame().i18n.localize(
          `${LANG_NAME}.indicatorMuted`
        )}"></i>`
      ),
      hidden: $(
        `<i class="fas fa-eye-slash fa-fw status-remote-hidden hidden" title="${getGame().i18n.localize(
          `${LANG_NAME}.indicatorHidden`
        )}"></i>`
      ),
    };

    // TODO: We aren't tracking PTT properly yet. Set this after we are.
    // const voiceMode = something;
    // indicators.ptt.toggleClass("hidden", !(voiceMode === "ptt"));

    indicators.muted.toggleClass(
      "hidden",
      !this.getUserAudioTrack(userId)?.isMuted
    );
    indicators.hidden.toggleClass(
      "hidden",
      !this.getUserVideoTrack(userId)?.isMuted
    );

    Object.values(indicators).forEach((indicator) => {
      if (userNotificationBar instanceof Element) {
        $(userNotificationBar).append(indicator);
      }
    });
  }

  async attachAudioTrack(
    userId: string,
    userAudioTrack: RemoteAudioTrack,
    audioElement: HTMLAudioElement
  ): Promise<void> {
    if (userAudioTrack.attachedElements.includes(audioElement)) {
      log.debug(
        "Audio track",
        userAudioTrack,
        "already attached to element",
        audioElement,
        "; skipping"
      );
      return;
    }

    // Set audio output device
    // @ts-expect-error - sinkId is currently an experimental property and not in the defined types
    if (audioElement.sinkId === undefined) {
      log.warn("Your web browser does not support output audio sink selection");
    } else {
      const requestedSink = this.settings.get("client", "audioSink");
      // @ts-expect-error - setSinkId is currently an experimental method and not in the defined types
      await audioElement.setSinkId(requestedSink).catch((error: unknown) => {
        let message = error;
        if (error instanceof Error) {
          message = error.message;
        }
        log.error(
          "An error occurred when requesting the output audio device:",
          requestedSink,
          message
        );
      });
    }

    // Detach from any existing elements
    userAudioTrack.detach();

    // Attach the audio track
    userAudioTrack.attach(audioElement);

    // Set the parameters
    let userVolume = this.settings.getUser(userId)?.volume;
    if (typeof userVolume === "undefined") {
      userVolume = 1.0;
    }
    audioElement.volume = userVolume;
    audioElement.muted = this.settings.get("client", "muteAll") === true;
  }

  attachVideoTrack(
    userVideoTrack: VideoTrack,
    videoElement: HTMLVideoElement
  ): void {
    if (userVideoTrack.attachedElements.includes(videoElement)) {
      log.debug(
        "Video track",
        userVideoTrack,
        "already attached to element",
        videoElement,
        "; skipping"
      );
      return;
    }

    // Detach from any existing elements
    userVideoTrack.detach();

    // Attach to the video element
    userVideoTrack.attach(videoElement);
  }

  async changeAudioSource(): Promise<void> {
    if (
      !this.audioTrack ||
      this.settings.get("client", "audioSrc") === "disabled" ||
      !this.avMaster.canUserBroadcastAudio(getGame().user?.id || "")
    ) {
      if (this.audioTrack) {
        this.liveKitRoom?.localParticipant.unpublishTrack(this.audioTrack);
        this.audioTrack.stop();
        this.audioTrack = null;
        getGame().user?.broadcastActivity({ av: { muted: true } });
      } else {
        await this.initializeAudioTrack();
        if (this.audioTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.audioTrack
          );
          getGame().user?.broadcastActivity({ av: { muted: false } });
          this.avMaster.render();
        }
      }
    } else {
      const audioParams = this.getAudioParams();
      if (audioParams) {
        this.audioTrack.restartTrack(audioParams);
      }
    }
  }

  async changeVideoSource(): Promise<void> {
    if (
      !this.videoTrack ||
      this.settings.get("client", "videoSrc") === "disabled" ||
      !this.avMaster.canUserBroadcastVideo(getGame().user?.id || "")
    ) {
      if (this.videoTrack) {
        this.liveKitRoom?.localParticipant.unpublishTrack(this.videoTrack);
        this.videoTrack.detach();
        this.videoTrack.stop();
        this.videoTrack = null;
        getGame().user?.broadcastActivity({ av: { hidden: true } });
      } else {
        await this.initializeVideoTrack();
        if (this.videoTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.videoTrack,
            {
              simulcast: this.simulcastEnabled,
              videoSimulcastLayers: [VideoPresets43.h120, VideoPresets43.h240],
            }
          );
          const userVideoElement = ui.webrtc?.getUserVideoElement(
            getGame().user?.id || ""
          );
          if (userVideoElement instanceof HTMLVideoElement) {
            this.attachVideoTrack(this.videoTrack, userVideoElement);
          }
          getGame().user?.broadcastActivity({ av: { hidden: false } });
          this.avMaster.render();
        }
      }
    } else {
      const videoParams = this.getVideoParams();
      if (videoParams) {
        this.videoTrack.restartTrack(videoParams);
      }
    }
  }

  /**
   * Creates a new AccessToken and returns it as a signed JWT
   * @param apiKey API Key
   * @param apiSecret Secret
   * @param roomName The LiveKit room to join
   * @param userName Display name of the FVTT user
   * @param metadata User metadata, including the FVTT User ID
   */
  async getAccessToken(
    apiKey: string,
    secretKey: string,
    roomName: string,
    userName: string,
    metadata: string
  ): Promise<string> {
    // Set ths signing options
    const signOpts: jwt.SignOptions = {
      issuer: apiKey, // The configured API Key
      expiresIn: "10h", // Expire after 12 hours
      jwtid: userName, // Use the username for the JWT ID
      subject: userName, // Use the username fot the JWT Subject
      notBefore: "-15m", // Give us a 15 minute buffer in case the user's clock is set incorrectly
      noTimestamp: true, // Don't set a timestamp since we are backdating the token
    };

    // Set the payload to be signed, including the permission to join the room and the user metadata
    const tokenPayload = {
      video: {
        // LiveKit permission grants
        roomJoin: true,
        room: roomName,
      },
      metadata: metadata,
    };

    // Sign and return the JWT
    const accessTokenJwt = jwt.sign(tokenPayload, secretKey, signOpts);
    log.debug("AccessToken:", accessTokenJwt);
    return accessTokenJwt;
  }

  getAudioParams(): AudioCaptureOptions | false {
    // Determine whether the user can send audio
    const audioSrc = this.settings.get("client", "audioSrc");
    const canBroadcastAudio = this.avMaster.canUserBroadcastAudio(
      getGame().user?.id || ""
    );

    return typeof audioSrc === "string" &&
      audioSrc !== "disabled" &&
      canBroadcastAudio
      ? {
          deviceId: { ideal: audioSrc },
        }
      : false;
  }

  getParticipantFVTTUser(participant: Participant): User | undefined {
    const { fvttUserId } = JSON.parse(participant.metadata || "{}");
    return getGame().users?.get(fvttUserId);
  }

  getParticipantUseExternalAV(participant: Participant): boolean {
    const { useExternalAV } = JSON.parse(participant.metadata || "{ false }");
    return useExternalAV;
  }

  getUserAudioTrack(
    userId: string | undefined
  ): LocalAudioTrack | RemoteAudioTrack | null {
    let audioTrack: LocalAudioTrack | RemoteAudioTrack | null = null;

    // If the user ID is null, return a null track
    if (!userId) {
      return audioTrack;
    }

    this.liveKitParticipants.get(userId)?.audioTracks.forEach((publication) => {
      if (
        publication.kind === Track.Kind.Audio &&
        (publication.track instanceof LocalAudioTrack ||
          publication.track instanceof RemoteAudioTrack)
      ) {
        audioTrack = publication.track;
      }
    });
    return audioTrack;
  }

  getUserStatistics(userId: string): string {
    const participant = this.liveKitParticipants.get(userId);
    let totalBitrate = 0;
    if (!participant) {
      return "";
    }

    for (const t of participant.tracks.values()) {
      if (t.track) {
        totalBitrate += t.track.currentBitrate;
      }
    }
    let bitrate = "";
    if (totalBitrate > 0) {
      bitrate = `${Math.round(totalBitrate / 1024).toLocaleString()} kbps`;
    }

    return bitrate;
  }

  getAllUserStatistics(): Map<string, string> {
    const userStatistics: Map<string, string> = new Map();
    this.liveKitParticipants.forEach((participant, userId) => {
      userStatistics.set(userId, this.getUserStatistics(userId));
    });
    return userStatistics;
  }

  getUserVideoTrack(
    userId: string | undefined
  ): LocalVideoTrack | RemoteVideoTrack | null {
    let videoTrack: LocalVideoTrack | RemoteVideoTrack | null = null;

    // If the user ID is null, return a null track
    if (!userId) {
      return videoTrack;
    }

    this.liveKitParticipants.get(userId)?.videoTracks.forEach((publication) => {
      if (
        publication.kind === Track.Kind.Video &&
        (publication.track instanceof LocalVideoTrack ||
          publication.track instanceof RemoteVideoTrack)
      ) {
        videoTrack = publication.track;
      }
    });
    return videoTrack;
  }

  /**
   * Obtain a reference to the video.user-audio which plays the audio channel for a requested
   * Foundry User.
   * If the element doesn't exist, but a video element does, it will create it.
   * @param {string} userId                   The ID of the User entity
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement of the user
   * @return {HTMLAudioElement|null}
   */
  getUserAudioElement(
    userId: string,
    videoElement: HTMLVideoElement | null = null,
    audioType: Track.Source
  ): HTMLAudioElement | null {
    // Find an existing audio element
    let audioElement = ui.webrtc?.element.find(
      `.camera-view[data-user=${userId}] audio.user-${audioType}-audio`
    )[0];

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = `user-${audioType}-audio`;
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.autoplay = true;
      }
      videoElement.after(audioElement);

      // Bind volume control for microphone audio
      ui.webrtc?.element
        .find(`.camera-view[data-user=${userId}] .webrtc-volume-slider`)
        .on("change", this.onVolumeChange.bind(this));
    }

    if (audioElement instanceof HTMLAudioElement) {
      return audioElement;
    }

    // The audio element was not found or created
    return null;
  }

  async initializeLocalTracks(): Promise<void> {
    await this.initializeAudioTrack();
    await this.initializeVideoTrack();
  }

  async initializeAudioTrack(): Promise<void> {
    // Make sure the track is initially unset
    this.audioTrack = null;

    // Get audio parameters
    const audioParams = this.getAudioParams();

    // Get the track if requested
    if (audioParams) {
      try {
        this.audioTrack = await createLocalAudioTrack(audioParams);
      } catch (error: unknown) {
        let message = error;
        if (error instanceof Error) {
          message = error.message;
        }
        log.error("Unable to acquire local audio:", message);
      }
    }

    // Check that mute/hidden/broadcast is toggled properly for the track
    if (
      this.audioTrack &&
      !(
        this.liveKitAvClient.isVoiceAlways &&
        this.avMaster.canUserShareAudio(getGame().user?.id || "")
      )
    ) {
      this.audioTrack.mute();
    }
  }

  async initializeVideoTrack(): Promise<void> {
    // Make sure the track is initially unset
    this.videoTrack = null;

    // Get video parameters
    const videoParams = this.getVideoParams();

    // Get the track if requested
    if (videoParams) {
      try {
        this.videoTrack = await createLocalVideoTrack(videoParams);
      } catch (error: unknown) {
        let message = error;
        if (error instanceof Error) {
          message = error.message;
        }
        log.error("Unable to acquire local video:", message);
      }
    }

    // Check that mute/hidden/broadcast is toggled properly for the track
    if (
      this.videoTrack &&
      !this.avMaster.canUserShareVideo(getGame().user?.id || "")
    ) {
      this.videoTrack.mute();
    }
  }

  async initializeRoom(): Promise<void> {
    // set the LiveKit publish defaults
    const liveKitPublishDefaults: TrackPublishDefaults = {
      simulcast: this.simulcastEnabled,
      videoSimulcastLayers: [VideoPresets43.h120, VideoPresets43.h240],
    };

    // Set the livekit room options
    const liveKitRoomOptions: RoomOptions = {
      adaptiveStream: this.simulcastEnabled,
      dynacast: this.simulcastEnabled,
      publishDefaults: liveKitPublishDefaults,
    };

    // Create and configure the room
    this.liveKitRoom = new Room(liveKitRoomOptions);

    // Set up room callbacks
    this.setRoomCallbacks();
  }

  isLiveKitServerType(
    liveKitServerType: LiveKitServerType
  ): liveKitServerType is LiveKitServerType {
    if (
      typeof liveKitServerType.key !== "string" ||
      typeof liveKitServerType.label !== "string" ||
      typeof liveKitServerType.urlRequired !== "boolean" ||
      typeof liveKitServerType.usernameRequired !== "boolean" ||
      typeof liveKitServerType.passwordRequired !== "boolean" ||
      !(liveKitServerType.tokenFunction instanceof Function)
    ) {
      return false;
    }
    return true;
  }

  isUserExternal(userId: string): boolean {
    // TODO: Implement this when adding external user support
    log.debug("isUserExternal not yet implemented; userId:", userId);
    return false;
  }

  onAudioPlaybackStatusChanged(canPlayback: boolean): void {
    if (!canPlayback) {
      log.warn("Cannot play audio/video, waiting for user interaction");
      this.windowClickListener =
        this.windowClickListener || this.onWindowClick.bind(this);
      window.addEventListener("click", this.windowClickListener);
    }
  }

  async onConnected(): Promise<void> {
    log.debug("Client connected");

    // Set up local participant callbacks
    this.setLocalParticipantCallbacks();

    // Add users to participants list
    this.addAllParticipants();

    // Set connection button state
    this.setConnectionButtons(true);

    // Publish local tracks
    if (this.audioTrack) {
      await this.liveKitRoom?.localParticipant.publishTrack(this.audioTrack);
    }
    if (this.videoTrack) {
      await this.liveKitRoom?.localParticipant.publishTrack(this.videoTrack, {
        simulcast: this.simulcastEnabled,
        videoSimulcastLayers: [VideoPresets43.h120, VideoPresets43.h240],
      });
    }
  }

  onConnectionQualityChanged(quality: string, participant: Participant) {
    log.debug("onConnectionQualityChanged:", quality, participant);

    if (!getGame().settings.get(MODULE_NAME, "displayConnectionQuality")) {
      // Connection quality indicator is not enabled
      return;
    }

    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Quality changed participant",
        participant,
        "is not an FVTT user"
      );
      return;
    }

    this.setConnectionQualityIndicator(fvttUserId, quality);
  }

  onDisconnected(): void {
    log.debug("Client disconnected");
    ui.notifications?.warn(
      `${getGame().i18n.localize(`${LANG_NAME}.onDisconnected`)}`
    );

    // Clear the participant map
    this.liveKitParticipants.clear();

    // Set connection buttons state
    this.setConnectionButtons(false);

    this.connectionState = ConnectionState.Disconnected;

    // TODO: Add some incremental back-off reconnect logic here
  }

  onGetUserContextOptions(
    playersElement: JQuery<HTMLElement>,
    contextOptions: ContextMenuEntry[]
  ): void {
    // Don't add breakout options if AV is disabled
    if (this.settings.get("world", "mode") === AVSettings.AV_MODES.DISABLED) {
      return;
    }

    addContextOptions(contextOptions, this);
  }

  onIsSpeakingChanged(userId: string | undefined, speaking: boolean): void {
    if (userId) {
      ui.webrtc?.setUserIsSpeaking(userId, speaking);
    }
  }

  onParticipantConnected(participant: RemoteParticipant): void {
    log.debug("onParticipantConnected:", participant);

    const fvttUser = this.getParticipantFVTTUser(participant);

    if (!fvttUser?.id) {
      log.error(
        "Joining participant",
        participant,
        "is not an FVTT user; cannot display them"
      );
      return;
    }

    if (!fvttUser.active) {
      // Force the user to be active. If they are signing in to meeting, they should be online.
      log.warn(
        "Joining user",
        fvttUser.id,
        "is not listed as active. Setting to active."
      );
      fvttUser.active = true;
      ui.players?.render();
    }

    // Save the participant to the ID mapping
    this.liveKitParticipants.set(fvttUser.id, participant);

    // Clear breakout room cache if user is joining the main conference
    if (!this.breakoutRoom) {
      this.settings.set(
        "client",
        `users.${fvttUser.id}.liveKitBreakoutRoom`,
        ""
      );
    }

    // Set up remote participant callbacks
    this.setRemoteParticipantCallbacks(participant);

    participant.tracks.forEach((publication) => {
      this.onTrackPublished(publication, participant);
    });

    // Call a debounced render
    this.render();
  }

  onParticipantDisconnected(participant: RemoteParticipant): void {
    log.debug("onParticipantDisconnected:", participant);

    // Remove the participant from the ID mapping
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn("Leaving participant", participant, "is not an FVTT user");
      return;
    }

    this.liveKitParticipants.delete(fvttUserId);

    // Clear breakout room cache if user is leaving a breakout room
    if (
      this.settings.get("client", `users.${fvttUserId}.liveKitBreakoutRoom`) ===
        this.liveKitAvClient.room &&
      this.liveKitAvClient.room === this.breakoutRoom
    ) {
      this.settings.set(
        "client",
        `users.${fvttUserId}.liveKitBreakoutRoom`,
        ""
      );
    }

    // Call a debounced render
    this.render();
  }

  onReconnected(): void {
    log.info("Reconnect issued");
    // Re-render just in case users changed
    this.render();
  }

  onReconnecting(): void {
    log.warn("Reconnecting to room");
    ui.notifications?.warn(
      `${getGame().i18n.localize("WEBRTC.ConnectionLostWarning")}`
    );
  }

  onSocketEvent(message: SocketMessage, userId: string): void {
    log.debug("Socket event:", message, "from:", userId);
    switch (message.action) {
      case "breakout":
        // Allow only GMs to issue breakout requests. Ignore requests that aren't for us.
        if (
          getGame().users?.get(userId)?.isGM &&
          (typeof message.breakoutRoom === "string" ||
            message.breakoutRoom === null) &&
          (!message.userId || message.userId === getGame().user?.id)
        ) {
          breakout(message.breakoutRoom, this);
        }
        break;
      case "connect":
        if (getGame().users?.get(userId)?.isGM) {
          this.avMaster.connect();
        } else {
          log.warn("Connect socket event from non-GM user; ignoring");
        }
        break;
      case "disconnect":
        if (getGame().users?.get(userId)?.isGM) {
          this.avMaster.disconnect().then(() => this.render());
        } else {
          log.warn("Disconnect socket event from non-GM user; ignoring");
        }
        break;
      case "render":
        if (getGame().users?.get(userId)?.isGM) {
          this.render();
        } else {
          log.warn("Render socket event from non-GM user; ignoring");
        }
        break;
      default:
        log.warn("Unknown socket event:", message);
    }
  }

  onTrackMuteChanged(
    publication: TrackPublication,
    participant: Participant
  ): void {
    log.debug("onTrackMuteChanged:", publication, participant);

    // Local participant
    if (participant === this.liveKitRoom?.localParticipant) {
      log.debug("Local", publication.kind, "track muted:", publication.isMuted);
      return;
    }

    // Remote participant
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;
    const useExternalAV = this.getParticipantUseExternalAV(participant);

    if (!fvttUserId) {
      log.warn("Mute change participant", participant, "is not an FVTT user");
      return;
    }

    if (this.isVersion9 && useExternalAV) {
      if (publication.kind === Track.Kind.Audio) {
        this.avMaster.settings.handleUserActivity(fvttUserId, {
          muted: publication.isMuted,
        });
      } else if (publication.kind === Track.Kind.Video) {
        this.avMaster.settings.handleUserActivity(fvttUserId, {
          hidden: publication.isMuted,
        });
      }
    } else {
      const userCameraView = ui.webrtc?.getUserCameraView(fvttUserId);
      if (userCameraView) {
        let uiIndicator;
        if (publication.kind === Track.Kind.Audio) {
          uiIndicator = userCameraView.querySelector(".status-remote-muted");
        } else if (publication.kind === Track.Kind.Video) {
          uiIndicator = userCameraView.querySelector(".status-remote-hidden");
        }

        if (uiIndicator) {
          uiIndicator.classList.toggle("hidden", !publication.isMuted);
        }
      }
    }
  }

  onRenderCameraViews(
    cameraviews: CameraViews,
    html: JQuery<HTMLElement>
  ): void {
    const cameraBox = html.find(`[data-user="${getGame().user?.id}"]`);
    const element = cameraBox.find('[data-action="configure"]');
    this.addConnectionButtons(element);
  }

  onTrackPublished(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    log.debug("onTrackPublished:", publication, participant);

    // Get configured settings
    const disableReceivingAudio = getGame().settings.get(
      MODULE_NAME,
      "disableReceivingAudio"
    );
    const disableReceivingVideo = getGame().settings.get(
      MODULE_NAME,
      "disableReceivingVideo"
    );

    // Skip if neither video or audio are disabled; tracks will be auto-subscribed
    if (!disableReceivingAudio && !disableReceivingVideo) {
      return;
    }

    // Subscribe to a track if its type hasn't been disabled
    if (publication.kind === Track.Kind.Audio && !disableReceivingAudio) {
      publication.setSubscribed(true);
    } else if (
      publication.kind === Track.Kind.Video &&
      !disableReceivingVideo
    ) {
      publication.setSubscribed(true);
    } else {
      log.info(
        "Not subscribing to",
        publication.kind,
        "track",
        publication,
        "for participant",
        participant
      );
    }
  }

  async onTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): Promise<void> {
    log.debug("onTrackSubscribed:", track, publication, participant);
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Track subscribed participant",
        participant,
        "is not an FVTT user"
      );
      return;
    }

    const videoElement = ui.webrtc?.getUserVideoElement(fvttUserId);

    if (!videoElement) {
      log.debug(
        "videoElement not yet ready for",
        fvttUserId,
        "; skipping publication",
        publication
      );
      return;
    }

    if (track instanceof RemoteAudioTrack) {
      // Get the audio element for the user
      const audioElement = this.getUserAudioElement(
        fvttUserId,
        videoElement,
        publication.source
      );
      if (audioElement) {
        await this.attachAudioTrack(fvttUserId, track, audioElement);
      }
    } else if (track instanceof RemoteVideoTrack) {
      this.attachVideoTrack(track, videoElement);
    } else {
      log.warn("Unknown track type subscribed from publication", publication);
    }
  }

  onTrackUnSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    log.debug("onTrackUnSubscribed:", track, publication, participant);
    track.detach();
  }

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   */
  onVolumeChange(event: JQuery.ChangeEvent): void {
    const input = event.currentTarget;
    const box = input.closest(".camera-view");
    const volume = AudioHelper.inputToVolume(input.value);
    const audioElements: HTMLCollection = box.getElementsByTagName("audio");
    for (const audioElement of audioElements) {
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.volume = volume;
      }
    }
  }

  onWindowClick(): void {
    if (this.windowClickListener) {
      window.removeEventListener("click", this.windowClickListener);
      this.render();
    }
  }

  getVideoParams(): VideoCaptureOptions | false {
    // Configure whether the user can send video
    const videoSrc = this.settings.get("client", "videoSrc");
    const canBroadcastVideo = this.avMaster.canUserBroadcastVideo(
      getGame().user?.id || ""
    );

    // Set resolution higher if simulcast is enabled
    let videoResolution = VideoPresets43.h240.resolution;
    if (this.simulcastEnabled) {
      videoResolution = VideoPresets43.h720.resolution;
    }

    return typeof videoSrc === "string" &&
      videoSrc !== "disabled" &&
      canBroadcastVideo
      ? {
          deviceId: { ideal: videoSrc },
          resolution: videoResolution,
        }
      : false;
  }

  sendJoinMessage(liveKitServer: string, accessToken: string) {
    const foundryHost = window.location.href.replace(/\/game.*$/, "");
    // Create the url for user to join the external LiveKit web client
    const params = new URLSearchParams({
      url: `wss://${liveKitServer}`,
      token: accessToken,
    });
    const url = `${foundryHost}/modules/avclient-livekit/web-client/index.html?${params.toString()}`;

    const joinDialog = new Dialog({
      title: getGame().i18n.localize(`${LANG_NAME}.externalAVJoinTitle`),
      content: `<p>${getGame().i18n.localize(
        `${LANG_NAME}.externalAVJoinMessage`
      )}</p>`,
      buttons: {
        join: {
          icon: '<i class="fas fa-check"></i>',
          label: getGame().i18n.localize(`${LANG_NAME}.externalAVJoinButton`),
          callback: () => window.open(url),
        },
        ignore: {
          icon: '<i class="fas fa-times"></i>',
          label: getGame().i18n.localize(`${LANG_NAME}.externalAVIgnoreButton`),
          callback: () => log.debug("Ignoring External LiveKit join request"),
        },
      },
      default: "join",
    });
    joinDialog.render(true);
  }

  setAudioEnabledState(enable: boolean): void {
    if (!this.audioTrack) {
      log.debug("setAudioEnabledState called but no audio track available");
      return;
    }
    if (this.liveKitRoom?.state !== ConnectionState.Connected) {
      log.debug(
        "setAudioEnabledState called but LiveKit room is not connected"
      );
      return;
    }

    if (!enable && !this.audioTrack.isMuted) {
      log.debug("Muting audio track", this.audioTrack);
      this.audioTrack.mute();
    } else if (enable && this.audioTrack.isMuted) {
      log.debug("Un-muting audio track", this.audioTrack);
      this.audioTrack.unmute();
    } else {
      log.debug(
        "setAudioEnabledState called but track is already in the current state"
      );
    }
  }

  setConnectionButtons(connected: boolean): void {
    const userCameraView = ui.webrtc?.getUserCameraView(
      getGame().user?.id || ""
    );

    if (userCameraView) {
      const connectButton = userCameraView.querySelector(
        ".livekit-control.connect"
      );
      const disconnectButton = userCameraView.querySelector(
        ".livekit-control.disconnect"
      );

      connectButton?.classList.toggle("hidden", connected);
      connectButton?.classList.toggle("disabled", false);
      disconnectButton?.classList.toggle("hidden", !connected);
      disconnectButton?.classList.toggle("disabled", false);
    }
  }

  setConnectionQualityIndicator(userId: string, quality?: string): void {
    // Get the user camera view and connection quality indicator
    const userCameraView = ui.webrtc?.getUserCameraView(userId);
    const connectionQualityIndicator = userCameraView?.querySelector(
      ".connection-quality-indicator"
    );

    if (!quality) {
      quality =
        this.liveKitParticipants.get(userId)?.connectionQuality ||
        ConnectionQuality.Unknown;
    }

    if (connectionQualityIndicator instanceof HTMLSpanElement) {
      // Remove all existing quality classes
      connectionQualityIndicator.classList.remove(
        ...Object.values(ConnectionQuality)
      );

      // Add the correct quality class
      connectionQualityIndicator.classList.add(quality);

      // Set the hover title
      connectionQualityIndicator.title = getGame().i18n.localize(
        `${LANG_NAME}.connectionQuality.${quality}`
      );
    }
  }

  setLocalParticipantCallbacks(): void {
    this.liveKitRoom?.localParticipant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, getGame().user?.id)
      )
      .on(ParticipantEvent.ParticipantMetadataChanged, (...args) => {
        log.debug("Local ParticipantEvent ParticipantMetadataChanged:", args);
      })
      .on(ParticipantEvent.TrackPublished, (...args) => {
        log.debug("Local ParticipantEvent TrackPublished:", args);
      });
  }

  setRemoteParticipantCallbacks(participant: RemoteParticipant): void {
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Participant",
        participant,
        "is not an FVTT user; skipping setRemoteParticipantCallbacks"
      );
      return;
    }

    participant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, fvttUserId)
      )
      .on(ParticipantEvent.ParticipantMetadataChanged, (...args) => {
        log.debug("Remote ParticipantEvent ParticipantMetadataChanged:", args);
      });
  }

  setRoomCallbacks(): void {
    if (!this.liveKitRoom) {
      log.warn(
        "Attempted to set up room callbacks before the LiveKit room is ready"
      );
      return;
    }

    // Set up event callbacks
    this.liveKitRoom
      .on(
        RoomEvent.AudioPlaybackStatusChanged,
        this.onAudioPlaybackStatusChanged.bind(this)
      )
      .on(
        RoomEvent.ParticipantConnected,
        this.onParticipantConnected.bind(this)
      )
      .on(
        RoomEvent.ParticipantDisconnected,
        this.onParticipantDisconnected.bind(this)
      )
      .on(RoomEvent.TrackPublished, this.onTrackPublished.bind(this))
      .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed.bind(this))
      .on(RoomEvent.TrackSubscriptionFailed, (...args) => {
        log.error("RoomEvent TrackSubscriptionFailed:", args);
      })
      .on(RoomEvent.TrackUnpublished, (...args) => {
        log.debug("RoomEvent TrackUnpublished:", args);
      })
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnSubscribed.bind(this))
      .on(RoomEvent.LocalTrackUnpublished, (...args) => {
        log.debug("RoomEvent LocalTrackUnpublished:", args);
      })
      .on(
        RoomEvent.ConnectionQualityChanged,
        this.onConnectionQualityChanged.bind(this)
      )
      .on(RoomEvent.Disconnected, this.onDisconnected.bind(this))
      .on(RoomEvent.Reconnecting, this.onReconnecting.bind(this))
      .on(RoomEvent.TrackMuted, this.onTrackMuteChanged.bind(this))
      .on(RoomEvent.TrackUnmuted, this.onTrackMuteChanged.bind(this))
      .on(RoomEvent.ParticipantMetadataChanged, (...args) => {
        log.debug("RoomEvent ParticipantMetadataChanged:", args);
      })
      .on(RoomEvent.RoomMetadataChanged, (...args) => {
        log.debug("RoomEvent RoomMetadataChanged:", args);
      })
      .on(RoomEvent.Reconnected, this.onReconnected.bind(this));
  }

  async shareScreen(enabled: boolean): Promise<void> {
    log.info("shareScreen:", enabled);

    if (enabled) {
      // Get screen tracks
      this.screenTracks = await createLocalScreenTracks({ audio: true });

      this.screenTracks.forEach(async (screenTrack: LocalTrack) => {
        log.debug("screenTrack enable:", screenTrack);
        if (screenTrack instanceof LocalVideoTrack) {
          // Stop our local video track
          if (this.videoTrack) {
            this.liveKitRoom?.localParticipant.unpublishTrack(this.videoTrack);
          }

          // Attach the screen share video to our video element
          const userVideoElement = ui.webrtc?.getUserVideoElement(
            getGame().user?.id || ""
          );
          if (userVideoElement instanceof HTMLVideoElement) {
            this.attachVideoTrack(screenTrack, userVideoElement);
          }
        }

        // Publish the track
        await this.liveKitRoom?.localParticipant.publishTrack(screenTrack, {
          audioBitrate: 160000,
        });
      });
    } else {
      this.screenTracks.forEach(async (screenTrack: LocalTrack) => {
        log.debug("screenTrack disable:", screenTrack);
        // Unpublish the screen share track
        this.liveKitRoom?.localParticipant.unpublishTrack(screenTrack);

        // Restart our video track
        if (screenTrack instanceof LocalVideoTrack && this.videoTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.videoTrack
          );

          if (!this.videoTrack.isMuted) {
            this.videoTrack.unmute();
          }
        }
      });
    }
  }

  get simulcastEnabled(): boolean {
    // Set simulcast to always enabled for testing of this functionality
    // return getGame().settings.get(MODULE_NAME, "simulcast") === true;
    return true;
  }
}
