import { AccessToken } from "livekit-server-sdk";
import {
  CreateAudioTrackOptions,
  createLocalAudioTrack,
  createLocalVideoTrack,
  CreateVideoTrackOptions,
  LocalAudioTrack,
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
  RoomState,
  Track,
  TrackEvent,
  VideoPresets43,
  VideoTrack,
} from "livekit-client";
import { LANG_NAME, MODULE_NAME } from "./utils/constants";
import * as log from "./utils/logging";
import { getGame } from "./utils/helpers";
import LiveKitAVClient from "./LiveKitAVClient";

export default class LiveKitClient {
  avMaster: AVMaster;
  liveKitAvClient: LiveKitAVClient;
  settings: AVSettings;
  render: () => void;

  audioTrack: LocalAudioTrack | null = null;
  liveKitParticipants: Map<string, Participant> = new Map();
  liveKitRoom: Room | null = null;
  videoTrack: LocalVideoTrack | null = null;
  windowClickListener: EventListener | null = null;

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
      this.avMaster.disconnect();
    });
    element.before(disconnectButton);

    if (this.liveKitRoom?.state === RoomState.Connected) {
      disconnectButton.toggleClass("hidden", false);
    } else {
      connectButton.toggleClass("hidden", false);
    }
  }

  addStatusIndicators(userId: string): void {
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
      !this.getParticipantAudioTrack(userId)?.isMuted
    );
    indicators.hidden.toggleClass(
      "hidden",
      !this.getParticipantVideoTrack(userId)?.isMuted
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
    audioElement.volume = this.settings.getUser(userId)?.volume || 1.0;
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
      this.settings.get("client", "audioSrc") === "disabled"
    ) {
      if (this.audioTrack) {
        this.liveKitRoom?.localParticipant.unpublishTrack(this.audioTrack);
        this.audioTrack.stop();
        this.audioTrack = null;
      } else {
        await this.initializeAudioTrack();
        if (this.audioTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.audioTrack
          );
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
      this.settings.get("client", "videoSrc") === "disabled"
    ) {
      if (this.videoTrack) {
        this.liveKitRoom?.localParticipant.unpublishTrack(this.videoTrack);
        this.videoTrack.detach();
        this.videoTrack.stop();
        this.videoTrack = null;
      } else {
        await this.initializeVideoTrack();
        if (this.videoTrack) {
          await this.liveKitRoom?.localParticipant.publishTrack(
            this.videoTrack,
            {
              simulcast:
                getGame().settings.get(MODULE_NAME, "simulcast") === true,
              videoEncoding: VideoPresets43.vga.encoding,
            }
          );
          const userVideoElement = ui.webrtc?.getUserVideoElement(
            getGame().user?.id || ""
          );
          if (userVideoElement instanceof HTMLVideoElement) {
            this.attachVideoTrack(this.videoTrack, userVideoElement);
          }
        }
      }
    } else {
      const videoParams = this.getVideoParams();
      if (videoParams) {
        this.videoTrack.restartTrack(videoParams);
      }
    }
  }

  getAccessToken(
    apiKey: string,
    secretKey: string,
    roomName: string,
    userName: string,
    metadata: string
  ): string {
    const accessToken = new AccessToken(apiKey, secretKey, {
      ttl: "10h",
      identity: userName,
      metadata: metadata,
    });
    accessToken.addGrant({ roomJoin: true, room: roomName });

    const accessTokenJwt = accessToken.toJwt();
    log.debug("AccessToken:", accessTokenJwt);
    return accessTokenJwt;
  }

  getAudioParams(): CreateAudioTrackOptions | false {
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

  getParticipantAudioTrack(userId: string): RemoteAudioTrack | null {
    let audioTrack: RemoteAudioTrack | null = null;
    this.liveKitParticipants.get(userId)?.audioTracks.forEach((publication) => {
      if (
        publication.kind === Track.Kind.Audio &&
        publication.track instanceof RemoteAudioTrack
      ) {
        audioTrack = publication.track;
      }
    });
    return audioTrack;
  }

  getParticipantVideoTrack(userId: string): RemoteVideoTrack | null {
    let videoTrack: RemoteVideoTrack | null = null;
    this.liveKitParticipants.get(userId)?.videoTracks.forEach((publication) => {
      if (
        publication.kind === Track.Kind.Video &&
        publication.track instanceof RemoteVideoTrack
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
    videoElement: HTMLVideoElement | null = null
  ): HTMLAudioElement | null {
    // Find an existing audio element
    let audioElement = ui.webrtc?.element.find(
      `.camera-view[data-user=${userId}] audio.user-audio`
    )[0];

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "user-audio";
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.autoplay = true;
      }
      videoElement.after(audioElement);

      // Bind volume control
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

  onAudioPlaybackStatusChanged(canPlayback: boolean): void {
    if (!canPlayback) {
      log.warn("Cannot play audio/video, waiting for user interaction");
      this.windowClickListener =
        this.windowClickListener || this.onWindowClick.bind(this);
      window.addEventListener("click", this.windowClickListener);
    }
  }

  onConnected(): void {
    log.debug("Client connected");

    // Set up room callbacks
    this.setRoomCallbacks();

    // Set up local participant callbacks
    this.setLocalParticipantCallbacks();

    // Set up local track callbacks
    this.setLocalTrackCallbacks();

    // Add users to participants list
    this.addAllParticipants();

    // Set connection button state
    this.setConnectionButtons(true);
  }

  onDisconnected(): void {
    log.debug("Client disconnected");
    ui.notifications?.warn(
      `${getGame().i18n.localize(`${LANG_NAME}.onDisconnected`)}`
    );

    // Set connection buttons state
    this.setConnectionButtons(false);

    // TODO: Add some incremental back-off reconnect logic here
  }

  onIsSpeakingChanged(userId: string | undefined, speaking: boolean): void {
    if (userId) {
      ui.webrtc?.setUserIsSpeaking(userId, speaking);
    }
  }

  onParticipantConnected(participant: RemoteParticipant): void {
    log.debug("onParticipantConnected:", participant);

    const { fvttUserId } = JSON.parse(participant.metadata || "");
    const fvttUser = getGame().users?.get(fvttUserId);

    if (!fvttUser) {
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
        fvttUserId,
        "is not listed as active. Setting to active."
      );
      fvttUser.active = true;
      ui.players?.render();
    }

    // Save the participant to the ID mapping
    this.liveKitParticipants.set(fvttUserId, participant);

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
    const { fvttUserId } = JSON.parse(participant.metadata || "");
    this.liveKitParticipants.delete(fvttUserId);

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

  onRemoteTrackMuteChanged(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const { fvttUserId } = JSON.parse(participant.metadata || "");
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
    const { fvttUserId } = JSON.parse(participant.metadata || "");
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

    if (publication.kind === Track.Kind.Audio) {
      // Get the audio element for the user
      const audioElement = this.getUserAudioElement(fvttUserId, videoElement);
      if (audioElement) {
        await this.attachAudioTrack(fvttUserId, track, audioElement);
      }
    } else if (publication.kind === Track.Kind.Video) {
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
    box.getElementsByTagName("audio")[0].volume = volume;
  }

  onWindowClick(): void {
    if (this.windowClickListener) {
      window.removeEventListener("click", this.windowClickListener);
      this.render();
    }
  }

  getVideoParams(): CreateVideoTrackOptions | false {
    // Configure whether the user can send video
    const videoSrc = this.settings.get("client", "videoSrc");
    const canBroadcastVideo = this.avMaster.canUserBroadcastVideo(
      getGame().user?.id || ""
    );
    return typeof videoSrc === "string" &&
      videoSrc !== "disabled" &&
      canBroadcastVideo
      ? {
          deviceId: { ideal: videoSrc },
          resolution: {
            width: { ideal: 320 },
            height: { ideal: 240 },
          },
        }
      : false;
  }

  setAudioEnabledState(enable: boolean): void {
    if (!this.audioTrack) {
      log.debug("setAudioEnabledState called but no audio track available");
      return;
    }
    if (this.liveKitRoom?.state !== RoomState.Connected) {
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

  setLocalParticipantCallbacks(): void {
    this.liveKitRoom?.localParticipant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, getGame().user?.id)
      )
      .on(ParticipantEvent.MetadataChanged, (...args) => {
        log.debug("Local ParticipantEvent MetadataChanged:", args);
      })
      .on(ParticipantEvent.TrackPublished, (...args) => {
        log.debug("Local ParticipantEvent TrackPublished:", args);
      });
  }

  setLocalTrackCallbacks(): void {
    // Set up local track callbacks
    this.liveKitRoom?.localParticipant.tracks.forEach((publication) => {
      const { track } = publication;
      if (track) {
        track
          .on(TrackEvent.Muted, (...args) => {
            log.debug("Local TrackEvent Muted:", args);
          })
          .on(TrackEvent.Unmuted, (...args) => {
            log.debug("Local TrackEvent Unmuted:", args);
          });
      }
    });
  }

  setRemoteParticipantCallbacks(participant: RemoteParticipant): void {
    const { fvttUserId } = JSON.parse(participant.metadata || "");

    participant
      .on(
        ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, fvttUserId)
      )
      .on(ParticipantEvent.MetadataChanged, (...args) => {
        log.debug("Remote ParticipantEvent MetadataChanged:", args);
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
      .on(RoomEvent.TrackUnpublished, (...args) => {
        log.debug("RoomEvent TrackUnpublished:", args);
      })
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnSubscribed.bind(this))
      .on(RoomEvent.Disconnected, this.onDisconnected.bind(this))
      .on(RoomEvent.Reconnecting, this.onReconnecting.bind(this))
      .on(RoomEvent.TrackMuted, this.onRemoteTrackMuteChanged.bind(this))
      .on(RoomEvent.TrackUnmuted, this.onRemoteTrackMuteChanged.bind(this))
      .on(RoomEvent.MetadataChanged, (...args) => {
        log.debug("RoomEvent MetadataChanged:", args);
      })
      .on(RoomEvent.Reconnected, this.onReconnected.bind(this));
  }
}
