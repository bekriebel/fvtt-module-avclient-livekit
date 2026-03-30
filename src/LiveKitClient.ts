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
  VideoCaptureOptions,
  VideoPresets43,
  VideoTrack,
  DisconnectReason,
  AudioPresets,
  TrackPublishOptions,
} from "livekit-client";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import LiveKitAVClient from "./LiveKitAVClient";
import {
  LiveKitServerType,
  LiveKitServerTypes,
  SocketMessage,
} from "../types/avclient-livekit";
import { addContextOptions, breakout } from "./LiveKitBreakout";
import { Logger } from "./utils/logger";
import { getAccessToken, getTavernAccessToken } from "./utils/auth";
import { debounceRefreshView } from "./utils/helpers";

const log = new Logger();

export enum InitState {
  Uninitialized = "uninitialized",
  Initializing = "initializing",
  Initialized = "initialized",
}

export default class LiveKitClient {
  avMaster: foundry.av.AVMaster;
  liveKitAvClient: LiveKitAVClient;
  settings: foundry.av.AVSettings;
  render: () => void;

  audioBroadcastEnabled = false;
  audioTrack: LocalAudioTrack | null = null;
  breakoutRoom: string | undefined;
  connectionState: ConnectionState = ConnectionState.Disconnected;
  initState: InitState = InitState.Uninitialized;
  liveKitParticipants = new Map<string, Participant>();
  liveKitRoom: Room | null = null;
  screenTracks: LocalTrack[] = [];
  useExternalAV = false;
  videoTrack: LocalVideoTrack | null = null;
  windowClickListener: EventListener | null = null;
  private _boundOnVolumeChange = this.onVolumeChange.bind(this);

  liveKitServerTypes: LiveKitServerTypes = {
    custom: {
      key: "custom",
      label: `${LANG_NAME}.serverTypeCustom`,
      details: `${LANG_NAME}.serverDetailsCustom`,
      urlRequired: true,
      usernameRequired: true,
      passwordRequired: true,
      tokenFunction: getAccessToken,
    },
    tavern: {
      key: "tavern",
      label: `${LANG_NAME}.serverTypeTavern`,
      details: `${LANG_NAME}.serverDetailsTavern`,
      url: "livekit.tavern.at",
      urlRequired: false,
      usernameRequired: false,
      passwordRequired: false,
      tokenFunction: getTavernAccessToken,
    },
  };

  defaultLiveKitServerType = this.liveKitServerTypes.custom;

  constructor(liveKitAvClient: LiveKitAVClient) {
    this.avMaster = liveKitAvClient.master;
    this.liveKitAvClient = liveKitAvClient;
    this.settings = liveKitAvClient.settings;

    this.render = foundry.utils.debounce(
      this.avMaster.render.bind(this.liveKitAvClient),
      2000,
    );
    Hooks.callAll("liveKitClientAvailable", this);
  }

  /* -------------------------------------------- */
  /*  LiveKit Internal methods                */
  /* -------------------------------------------- */

  addAllParticipants(): void {
    if (!this.liveKitRoom) {
      log.warn(
        "Attempting to add participants before the LiveKit room is available",
      );
      return;
    }

    // Add our user to the participants list
    const userId = game.user?.id;
    if (userId) {
      this.liveKitParticipants.set(userId, this.liveKitRoom.localParticipant);
    }

    // Set up all other users
    this.liveKitRoom.remoteParticipants.forEach(
      (participant: RemoteParticipant) => {
        this.onParticipantConnected(participant);
      },
    );
  }

  addConnectionButtons(element: HTMLElement): void {
    // If useExternalAV is enabled, return
    if (this.useExternalAV) {
      return;
    }

    const connectButton = document.createElement("button");
    connectButton.type = "button";
    connectButton.className =
      "av-control inline-control toggle icon fa-solid fa-fw fa-toggle-off livekit-control connect hidden";
    connectButton.dataset.tooltip = "";
    connectButton.ariaLabel =
      game.i18n?.localize(`${LANG_NAME}.connect`) ?? "connect";

    const disconnectButton = document.createElement("button");
    disconnectButton.type = "button";
    disconnectButton.className =
      "av-control inline-control toggle icon fa-solid fa-fw fa-toggle-on livekit-control disconnect hidden";
    disconnectButton.dataset.tooltip = "";
    disconnectButton.ariaLabel =
      game.i18n?.localize(`${LANG_NAME}.disconnect`) ?? "disconnect";

    connectButton.addEventListener("click", () => {
      connectButton.classList.toggle("disabled", true);
      this.avMaster.connect().catch((error: unknown) => {
        log.error("Error connecting:", error);
      });
    });
    element.before(connectButton);

    disconnectButton.addEventListener("click", () => {
      disconnectButton.classList.toggle("disabled", true);
      this.avMaster
        .disconnect()
        .then(() => {
          this.render();
        })
        .catch((error: unknown) => {
          log.error("Error disconnecting:", error);
        });
    });
    element.before(disconnectButton);

    if (this.liveKitRoom?.state === ConnectionState.Connected) {
      disconnectButton.classList.toggle("hidden", false);
    } else {
      connectButton.classList.toggle("hidden", false);
    }
  }

  addConnectionQualityIndicator(userId: string): void {
    if (!game.settings?.get(MODULE_NAME, "displayConnectionQuality")) {
      // Connection quality indicator is not enabled
      return;
    }

    // Get the user camera view and player name bar
    const userCameraView = document.querySelector(
      `.camera-view[data-user="${userId}"]`,
    );
    const userNameBar = userCameraView?.querySelector(".player-name");

    if (userCameraView?.querySelector(".connection-quality-indicator")) {
      // Connection quality indicator already exists
      return;
    }

    const connectionQualityIndicator = $(
      `<div class="connection-quality-indicator unknown" title="${
        game.i18n?.localize(
          `${LANG_NAME}.connectionQuality.${ConnectionQuality.Unknown}`,
        ) ?? "Connection Quality Unknown"
      }"></div>`,
    );

    if (userNameBar instanceof Element) {
      $(userNameBar).after(connectionQualityIndicator);
    }

    this.setConnectionQualityIndicator(userId);
  }

  addLiveKitServerType(liveKitServerType: LiveKitServerType): boolean {
    if (!this.isLiveKitServerType(liveKitServerType)) {
      log.error(
        "Attempted to add a LiveKitServerType that does not meet the requirements:",
        liveKitServerType,
      );
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.liveKitServerTypes[liveKitServerType.key] !== undefined) {
      log.error(
        "Attempted to add a LiveKitServerType with a key that already exists:",
        liveKitServerType,
      );
      return false;
    }
    this.liveKitServerTypes[liveKitServerType.key] = liveKitServerType;
    return true;
  }

  async attachAudioTrack(
    userId: string,
    userAudioTrack: RemoteAudioTrack,
    audioElement: HTMLAudioElement,
  ): Promise<void> {
    if (userAudioTrack.attachedElements.includes(audioElement)) {
      log.debug(
        "Audio track",
        userAudioTrack,
        "already attached to element",
        audioElement,
        "; skipping",
      );
      return;
    }

    // Set audio output device
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
          message,
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
    videoElement: HTMLVideoElement,
  ): void {
    if (userVideoTrack.attachedElements.includes(videoElement)) {
      log.debug(
        "Video track",
        userVideoTrack,
        "already attached to element",
        videoElement,
        "; skipping",
      );
      return;
    }

    // Detach from any existing elements
    userVideoTrack.detach();

    // Attach to the video element
    userVideoTrack.attach(videoElement);
  }

  async changeAudioSource(forceStop = false): Promise<void> {
    // Force the stop of an existing track
    if (forceStop && this.audioTrack) {
      await this.liveKitRoom?.localParticipant.unpublishTrack(this.audioTrack);
      this.audioTrack.stop();
      this.audioTrack = null;
      game.user?.broadcastActivity({ av: { muted: true } });
    }

    if (
      !this.audioTrack ||
      this.settings.get("client", "audioSrc") === "disabled" ||
      !this.avMaster.canUserBroadcastAudio(game.user?.id ?? "")
    ) {
      if (this.audioTrack) {
        await this.liveKitRoom?.localParticipant.unpublishTrack(
          this.audioTrack,
        );
        this.audioTrack.stop();
        this.audioTrack = null;
        game.user?.broadcastActivity({ av: { muted: true } });
      } else {
        await this.initializeAudioTrack();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.audioTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.audioTrack,
            this.trackPublishOptions,
          );
          game.user?.broadcastActivity({ av: { muted: false } });
          this.avMaster.render();
        }
      }
    } else {
      const audioParams = this.getAudioParams();
      if (audioParams) {
        await this.audioTrack.restartTrack(audioParams);
      }
    }
  }

  async changeVideoSource(): Promise<void> {
    if (
      !this.videoTrack ||
      this.settings.get("client", "videoSrc") === "disabled" ||
      !this.avMaster.canUserBroadcastVideo(game.user?.id ?? "")
    ) {
      if (this.videoTrack) {
        await this.liveKitRoom?.localParticipant.unpublishTrack(
          this.videoTrack,
        );
        this.videoTrack.detach();
        this.videoTrack.stop();
        this.videoTrack = null;
        game.user?.broadcastActivity({ av: { hidden: true } });
      } else {
        await this.initializeVideoTrack();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.videoTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.videoTrack,
            this.trackPublishOptions,
          );
          const userVideoElement = document.querySelector(
            `.camera-view[data-user="${game.user?.id ?? ""}"] video.user-video`,
          );
          if (userVideoElement instanceof HTMLVideoElement) {
            this.attachVideoTrack(this.videoTrack, userVideoElement);
          }
          game.user?.broadcastActivity({ av: { hidden: false } });
          this.avMaster.render();
        }
      }
    } else {
      const videoParams = this.getVideoParams();
      if (videoParams) {
        await this.videoTrack.restartTrack(videoParams);
      }
    }
  }

  getAudioParams(): AudioCaptureOptions | false {
    // Determine whether the user can send audio
    const audioSrc = this.settings.get("client", "audioSrc");
    const canBroadcastAudio = this.avMaster.canUserBroadcastAudio(
      game.user?.id ?? "",
    );

    if (
      typeof audioSrc !== "string" ||
      audioSrc === "disabled" ||
      !canBroadcastAudio
    ) {
      return false;
    }

    const audioCaptureOptions: AudioCaptureOptions = {
      deviceId: { ideal: audioSrc },
      channelCount: { ideal: 1 },
    };

    // Set audio parameters for music streaming mode
    if (game.settings?.get(MODULE_NAME, "audioMusicMode")) {
      audioCaptureOptions.autoGainControl = false;
      audioCaptureOptions.echoCancellation = false;
      audioCaptureOptions.noiseSuppression = false;
      audioCaptureOptions.channelCount = { ideal: 2 };
    }

    return audioCaptureOptions;
  }

  getParticipantFVTTUser(participant: Participant): User | undefined {
    try {
      const { fvttUserId } = JSON.parse(participant.metadata ?? "{}") as {
        fvttUserId?: string;
      };
      return fvttUserId ? game.users?.get(fvttUserId) : undefined;
    } catch (error) {
      log.warn("Failed to parse participant metadata for FVTT user lookup:", error);
      return undefined;
    }
  }

  getParticipantUseExternalAV(participant: Participant): boolean {
    try {
      const { useExternalAV } = JSON.parse(
        participant.metadata ?? "{}",
      ) as {
        useExternalAV?: boolean;
      };
      return useExternalAV ?? false;
    } catch (error) {
      log.warn("Failed to parse participant metadata for useExternalAV:", error);
      return false;
    }
  }

  getUserAudioTrack(
    userId: string | undefined,
  ): LocalAudioTrack | RemoteAudioTrack | null {
    let audioTrack: LocalAudioTrack | RemoteAudioTrack | null = null;

    // If the user ID is null, return a null track
    if (!userId) {
      return audioTrack;
    }

    this.liveKitParticipants
      .get(userId)
      ?.audioTrackPublications.forEach((publication) => {
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

    for (const t of participant.trackPublications.values()) {
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
    const userStatistics = new Map<string, string>();
    this.liveKitParticipants.forEach((_participant, userId) => {
      userStatistics.set(userId, this.getUserStatistics(userId));
    });
    return userStatistics;
  }

  getUserVideoTrack(
    userId: string | undefined,
  ): LocalVideoTrack | RemoteVideoTrack | null {
    let videoTrack: LocalVideoTrack | RemoteVideoTrack | null = null;

    // If the user ID is null, return a null track
    if (!userId) {
      return videoTrack;
    }

    this.liveKitParticipants
      .get(userId)
      ?.videoTrackPublications.forEach((publication) => {
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
    audioType: Track.Source,
  ): HTMLAudioElement | null {
    // Find an existing audio element
    let audioElement = ui.webrtc?.element.querySelector(
      `.camera-view[data-user="${userId}"] audio.user-${audioType}-audio`,
    );

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = `user-${audioType}-audio`;
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.autoplay = true;
      }
      videoElement.after(audioElement);

      // Bind volume control for microphone audio
      const volumeSlider =
        videoElement.parentElement?.parentElement?.querySelector(
          ".webrtc-volume-slider",
        );
      volumeSlider?.removeEventListener("change", this._boundOnVolumeChange);
      volumeSlider?.addEventListener("change", this._boundOnVolumeChange);
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
        this.avMaster.canUserShareAudio(game.user?.id ?? "")
      )
    ) {
      await this.audioTrack.mute();
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
      !this.avMaster.canUserShareVideo(game.user?.id ?? "")
    ) {
      await this.videoTrack.mute();
    }
  }

  initializeRoom(): void {
    // set the LiveKit publish defaults
    const liveKitPublishDefaults = this.trackPublishOptions;

    // Set the livekit room options
    const liveKitRoomOptions: RoomOptions = {
      adaptiveStream: liveKitPublishDefaults.simulcast,
      dynacast: liveKitPublishDefaults.simulcast,
      publishDefaults: liveKitPublishDefaults,
    };

    // Create and configure the room
    this.liveKitRoom = new Room(liveKitRoomOptions);

    // Set up room callbacks
    this.setRoomCallbacks();
  }

  isLiveKitServerType(
    liveKitServerType: LiveKitServerType,
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
        this.windowClickListener ?? this.onWindowClick.bind(this);
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
      await this.liveKitRoom?.localParticipant.publishTrack(
        this.audioTrack,
        this.trackPublishOptions,
      );
    }
    if (this.videoTrack) {
      await this.liveKitRoom?.localParticipant.publishTrack(
        this.videoTrack,
        this.trackPublishOptions,
      );
    }
  }

  onConnectionQualityChanged(quality: string, participant: Participant) {
    log.debug("onConnectionQualityChanged:", quality, participant);

    if (!game.settings?.get(MODULE_NAME, "displayConnectionQuality")) {
      // Connection quality indicator is not enabled
      return;
    }

    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Quality changed participant",
        participant,
        "is not an FVTT user",
      );
      return;
    }

    this.setConnectionQualityIndicator(fvttUserId, quality);
  }

  onDisconnected(reason?: DisconnectReason): void {
    log.debug("Client disconnected", { reason });
    let disconnectWarning =
      game.i18n?.localize(`${LANG_NAME}.onDisconnected`) ?? "onDisconnected";
    if (reason) {
      disconnectWarning += `: ${DisconnectReason[reason]}`;
    }
    ui.notifications?.warn(disconnectWarning);

    // Clear the participant map
    this.liveKitParticipants.clear();

    // Set connection buttons state
    this.setConnectionButtons(false);

    this.connectionState = ConnectionState.Disconnected;

    // TODO: Add some incremental back-off reconnect logic here
  }

  onGetUserContextOptions(
    _playersApp: foundry.applications.ui.Players,
    contextOptions: foundry.applications.ux.ContextMenu.Entry<HTMLElement>[],
  ): void {
    // Don't add breakout options if AV is disabled
    if (
      this.settings.get("world", "mode") ===
      foundry.av.AVSettings.AV_MODES.DISABLED
    ) {
      return;
    }

    addContextOptions(contextOptions, this);
  }

  onIsSpeakingChanged(userId: string | undefined, speaking: boolean): void {
    if (userId) {
      // @ts-expect-error - ui.webrtc.setUserIsSpeaking is not in foundry-vtt-types yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
        "is not an FVTT user; cannot display them",
      );
      return;
    }

    if (!fvttUser.active) {
      // Force the user to be active. If they are signing in to meeting, they should be online.
      log.warn(
        "Joining user",
        fvttUser.id,
        "is not listed as active. Setting to active.",
      );
      fvttUser.active = true;
      ui.players?.render().catch((error: unknown) => {
        log.error("Error rendering players view:", error);
      });
    }

    // Save the participant to the ID mapping
    this.liveKitParticipants.set(fvttUser.id, participant);

    // Clear breakout room cache if user is joining the main conference
    if (!this.breakoutRoom) {
      this.settings.set(
        "client",
        `users.${fvttUser.id}.liveKitBreakoutRoom`,
        "",
      );
    }

    // Set up remote participant callbacks
    this.setRemoteParticipantCallbacks(participant);

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
        "",
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
      game.i18n?.localize("WEBRTC.ConnectionLostWarning") ??
        "ConnectionLostWarning",
    );
  }

  onSocketEvent(message: SocketMessage, userId: string): void {
    log.debug("Socket event:", message, "from:", userId);
    switch (message.action) {
      case "breakout":
        // Allow only GMs to issue breakout requests. Ignore requests that aren't for us.
        if (
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          game.users?.get(userId)?.isGM &&
          (!message.userId || message.userId === game.user.id)
        ) {
          breakout(message.breakoutRoom, this);
        }
        break;
      case "connect":
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (game.users?.get(userId)?.isGM) {
          this.avMaster.connect().catch((error: unknown) => {
            log.error("Error connecting:", error);
          });
        } else {
          log.warn("Connect socket event from non-GM user; ignoring");
        }
        break;
      case "disconnect":
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (game.users?.get(userId)?.isGM) {
          this.avMaster
            .disconnect()
            .then(() => {
              this.render();
            })
            .catch((error: unknown) => {
              log.error("Error disconnecting:", error);
            });
        } else {
          log.warn("Disconnect socket event from non-GM user; ignoring");
        }
        break;
      case "render":
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (game.users?.get(userId)?.isGM) {
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
    participant: Participant,
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

    if (useExternalAV) {
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
      const userCameraView = document.querySelector(
        `.camera-view[data-user="${fvttUserId}"]`,
      );
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
    _cameraviews: foundry.applications.apps.av.CameraViews,
    html: HTMLElement,
  ): void {
    const userId = game.user?.id;
    if (!userId) {
      log.error("No user ID found; cannot render camera views");
      return;
    }
    const cameraBox = html.querySelector(
      `[data-user="${userId}"].user-controls`,
    );
    // Look for existing connection buttons
    if (cameraBox?.querySelector(".livekit-control")) {
      return;
    }
    const element = cameraBox?.querySelector('[data-action="configure"]');
    if (!(element instanceof HTMLElement)) {
      log.warn("Can't find CameraView configure element", element);
      return;
    }
    this.addConnectionButtons(element);
  }

  onTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    log.debug("onTrackSubscribed:", track, publication, participant);
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Track subscribed participant",
        participant,
        "is not an FVTT user",
      );
      return;
    }

    const videoElement = document.querySelector(
      `.camera-view[data-user="${fvttUserId}"]`,
    );

    if (!(videoElement instanceof HTMLVideoElement)) {
      log.debug(
        "videoElement not yet ready for",
        fvttUserId,
        "; skipping publication",
        publication,
      );
      debounceRefreshView(fvttUserId);
      return;
    }

    if (track instanceof RemoteAudioTrack) {
      // Get the audio element for the user
      const audioElement = this.getUserAudioElement(
        fvttUserId,
        videoElement,
        publication.source,
      );
      if (audioElement) {
        this.attachAudioTrack(fvttUserId, track, audioElement).catch(
          (error: unknown) => {
            log.error("Error attaching audio track:", error);
          },
        );
      }
    } else if (track instanceof RemoteVideoTrack) {
      this.attachVideoTrack(track, videoElement);
    } else {
      log.warn("Unknown track type subscribed from publication", publication);
    }

    debounceRefreshView(fvttUserId);
  }

  onTrackUnSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    log.debug("onTrackUnSubscribed:", track, publication, participant);
    track.detach();
  }

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   */
  onVolumeChange(event: Event): void {
    const input = event.currentTarget;
    if (
      !(input instanceof foundry.applications.elements.HTMLRangePickerElement)
    ) {
      log.warn(
        "Volume change event did not originate from a range picker element",
      );
      return;
    }
    const box = input.closest(".camera-view");
    const volume = foundry.audio.AudioHelper.inputToVolume(input.value);
    if (!(box instanceof HTMLElement)) {
      log.warn("Volume change event did not originate from a camera view box");
      return;
    }
    const audioElements: HTMLCollection = box.getElementsByTagName("audio");
    for (const audioElement of audioElements) {
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.volume = volume;
      }
    }

    // HACK: Needed to fix a bug in FVTT v13
    if (box.dataset.user) {
      this.settings.set("client", `users.${box.dataset.user}.volume`, volume);
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
      game.user?.id ?? "",
    );

    // Set resolution higher if simulcast is enabled
    let videoResolution = VideoPresets43.h180.resolution;
    if (this.trackPublishOptions.simulcast) {
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

  async sendJoinMessage(liveKitServer: string, accessToken: string) {
    // Create the url for user to join the external LiveKit web client
    const params = new URLSearchParams({
      liveKitUrl: `wss://${liveKitServer}`,
      token: accessToken,
    });
    const url = `https://meet.livekit.io/custom?${params.toString()}`;

    await foundry.applications.api.DialogV2.confirm({
      window: { title: `${LANG_NAME}.externalAVJoinTitle` },
      content: `<p>${
        game.i18n?.localize(`${LANG_NAME}.externalAVJoinMessage`) ??
        "externalAVJoinMessage"
      }</p>`,
      yes: {
        label: `${LANG_NAME}.externalAVJoinButton`,
        icon: "fa-solid fa-check",
        callback: () => window.open(url),
      },
      no: {
        label: `${LANG_NAME}.externalAVIgnoreButton`,
        icon: "fa-solid fa-xmark",
        callback: () => {
          log.info("Ignoring external LiveKit join request");
        },
      },
    });
  }

  setAudioEnabledState(enable: boolean): void {
    if (!this.audioTrack) {
      log.debug("setAudioEnabledState called but no audio track available");
      return;
    }
    if (this.liveKitRoom?.state !== ConnectionState.Connected) {
      log.debug(
        "setAudioEnabledState called but LiveKit room is not connected",
      );
      return;
    }

    if (!enable && !this.audioTrack.isMuted) {
      log.debug("Muting audio track", this.audioTrack);
      this.audioTrack.mute().catch((error: unknown) => {
        log.error("Error muting audio track:", error);
      });
    } else if (enable && this.audioTrack.isMuted) {
      log.debug("Un-muting audio track", this.audioTrack);
      this.audioTrack.unmute().catch((error: unknown) => {
        log.error("Error un-muting audio track:", error);
      });
    } else {
      log.debug(
        "setAudioEnabledState called but track is already in the current state",
      );
    }
  }

  setConnectionButtons(connected: boolean): void {
    const userCameraView = document.querySelector(
      `.camera-view[data-user="${game.user?.id ?? ""}"]`,
    );

    if (userCameraView) {
      const connectButton = userCameraView.querySelector(
        ".livekit-control.connect",
      );
      const disconnectButton = userCameraView.querySelector(
        ".livekit-control.disconnect",
      );

      connectButton?.classList.toggle("hidden", connected);
      connectButton?.classList.toggle("disabled", false);
      disconnectButton?.classList.toggle("hidden", !connected);
      disconnectButton?.classList.toggle("disabled", false);
    }
  }

  setConnectionQualityIndicator(userId: string, quality?: string): void {
    // Get the user camera view and connection quality indicator
    const userCameraView = document.querySelector(
      `.camera-view[data-user="${userId}"]`,
    );
    const connectionQualityIndicator = userCameraView?.querySelector(
      ".connection-quality-indicator",
    );

    quality ??=
      this.liveKitParticipants.get(userId)?.connectionQuality ??
      ConnectionQuality.Unknown;

    if (connectionQualityIndicator instanceof HTMLDivElement) {
      // Remove all existing quality classes
      connectionQualityIndicator.classList.remove(
        ...Object.values(ConnectionQuality),
      );

      // Add the correct quality class
      connectionQualityIndicator.classList.add(quality);

      // Set the hover title
      connectionQualityIndicator.title =
        game.i18n?.localize(`${LANG_NAME}.connectionQuality.${quality}`) ??
        quality;
    }
  }

  setLocalParticipantCallbacks(): void {
    // Remove existing listeners to prevent duplication on reconnect
    this.liveKitRoom?.localParticipant.removeAllListeners(
      ParticipantEvent.IsSpeakingChanged,
    );
    this.liveKitRoom?.localParticipant.removeAllListeners(
      ParticipantEvent.ParticipantMetadataChanged,
    );
    this.liveKitRoom?.localParticipant.removeAllListeners(
      ParticipantEvent.TrackPublished,
    );
    this.liveKitRoom?.localParticipant.removeAllListeners(
      ParticipantEvent.TrackSubscriptionStatusChanged,
    );

    this.liveKitRoom?.localParticipant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, game.user?.id),
      )
      .on(ParticipantEvent.ParticipantMetadataChanged, (...args) => {
        log.debug("Local ParticipantEvent ParticipantMetadataChanged:", args);
      })
      .on(ParticipantEvent.TrackPublished, (...args) => {
        log.debug("Local ParticipantEvent TrackPublished:", args);
      })
      .on(ParticipantEvent.TrackSubscriptionStatusChanged, (...args) => {
        log.debug(
          "Local ParticipantEvent TrackSubscriptionStatusChanged:",
          args,
        );
      });
  }

  setRemoteParticipantCallbacks(participant: RemoteParticipant): void {
    const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

    if (!fvttUserId) {
      log.warn(
        "Participant",
        participant,
        "is not an FVTT user; skipping setRemoteParticipantCallbacks",
      );
      return;
    }

    // Remove existing listeners to prevent duplication on reconnect
    participant.removeAllListeners(ParticipantEvent.IsSpeakingChanged);
    participant.removeAllListeners(ParticipantEvent.ParticipantMetadataChanged);

    participant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, fvttUserId),
      )
      .on(ParticipantEvent.ParticipantMetadataChanged, (...args) => {
        log.debug("Remote ParticipantEvent ParticipantMetadataChanged:", args);
      });
  }

  setRoomCallbacks(): void {
    if (!this.liveKitRoom) {
      log.warn(
        "Attempted to set up room callbacks before the LiveKit room is ready",
      );
      return;
    }

    // Remove existing event listeners to prevent duplication on reconnect.
    // IMPORTANT: Do NOT use removeAllListeners() without an event argument —
    // that would also remove LiveKit SDK's internal listeners and break the room.
    this.liveKitRoom.removeAllListeners(RoomEvent.AudioPlaybackStatusChanged);
    this.liveKitRoom.removeAllListeners(RoomEvent.ParticipantConnected);
    this.liveKitRoom.removeAllListeners(RoomEvent.ParticipantDisconnected);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackSubscribed);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackSubscriptionFailed);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackUnpublished);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackUnsubscribed);
    this.liveKitRoom.removeAllListeners(RoomEvent.LocalTrackUnpublished);
    this.liveKitRoom.removeAllListeners(RoomEvent.ConnectionQualityChanged);
    this.liveKitRoom.removeAllListeners(RoomEvent.Disconnected);
    this.liveKitRoom.removeAllListeners(RoomEvent.Reconnecting);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackMuted);
    this.liveKitRoom.removeAllListeners(RoomEvent.TrackUnmuted);
    this.liveKitRoom.removeAllListeners(RoomEvent.ParticipantMetadataChanged);
    this.liveKitRoom.removeAllListeners(RoomEvent.RoomMetadataChanged);
    this.liveKitRoom.removeAllListeners(RoomEvent.Reconnected);

    // Set up event callbacks
    this.liveKitRoom
      .on(
        RoomEvent.AudioPlaybackStatusChanged,
        this.onAudioPlaybackStatusChanged.bind(this),
      )
      .on(
        RoomEvent.ParticipantConnected,
        this.onParticipantConnected.bind(this),
      )
      .on(
        RoomEvent.ParticipantDisconnected,
        this.onParticipantDisconnected.bind(this),
      )
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
        this.onConnectionQualityChanged.bind(this),
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
      // Configure audio options
      const screenAudioOptions: AudioCaptureOptions = {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        channelCount: { ideal: 2 },
      };

      // Get screen tracks
      try {
        this.screenTracks = await createLocalScreenTracks({
          audio: screenAudioOptions,
        });
      } catch (error) {
        log.warn("Screen share cancelled or failed:", error);
        return;
      }

      for (const screenTrack of this.screenTracks) {
        log.debug("screenTrack enable:", screenTrack);
        if (screenTrack instanceof LocalVideoTrack) {
          // Stop our local video track
          if (this.videoTrack) {
            await this.liveKitRoom?.localParticipant.unpublishTrack(
              this.videoTrack,
            );
          }

          // Attach the screen share video to our video element
          const userVideoElement = document.querySelector(
            `.camera-view[data-user="${game.user?.id ?? ""}"]`,
          );
          if (userVideoElement instanceof HTMLVideoElement) {
            this.attachVideoTrack(screenTrack, userVideoElement);
          }
        }

        // Get publishing options
        const screenTrackPublishOptions = this.trackPublishOptions;

        // Use musicHighQuality audio preset for screen share
        screenTrackPublishOptions.audioPreset = AudioPresets.musicHighQuality;

        // Publish the track
        await this.liveKitRoom?.localParticipant.publishTrack(
          screenTrack,
          screenTrackPublishOptions,
        );
      }
    } else {
      for (const screenTrack of this.screenTracks) {
        log.debug("screenTrack disable:", screenTrack);
        // Unpublish the screen share track
        await this.liveKitRoom?.localParticipant.unpublishTrack(screenTrack);

        // Restart our video track
        if (screenTrack instanceof LocalVideoTrack && this.videoTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.videoTrack,
            this.trackPublishOptions,
          );

          if (!this.videoTrack.isMuted) {
            await this.videoTrack.unmute();
          }
        }
      }
    }
  }

  get trackPublishOptions(): TrackPublishOptions {
    const trackPublishOptions: TrackPublishOptions = {
      audioPreset: AudioPresets.speech,
      simulcast: true,
      videoCodec: "vp8",
      videoSimulcastLayers: [VideoPresets43.h180, VideoPresets43.h360],
    };

    if (game.settings?.get(MODULE_NAME, "audioMusicMode")) {
      trackPublishOptions.audioPreset = AudioPresets.musicHighQuality;
    }

    return trackPublishOptions;
  }
}
