import * as log from "./utils/logging.js";

import "./libs/livekit-client.min.js";

import "./libs/livekit-accesstoken.min.js";

export default class LiveKitClient {
  constructor(liveKitAvClient) {
    this.audioTrack = null;
    this.avMaster = liveKitAvClient.master;
    this.liveKitAvClient = liveKitAvClient;
    this.liveKitParticipants = new Map();
    this.liveKitRoom = null;
    this.room = null;
    this.settings = liveKitAvClient.settings;
    this.videoTrack = null;

    this.render = debounce(this.avMaster.render.bind(this.liveKitAvClient), 2000);
  }

  /* -------------------------------------------- */
  /*  LiveKit Internal methods                */
  /* -------------------------------------------- */

  addAllParticipants() {
    // Add our user to the participants list
    this.liveKitParticipants.set(game.user.id, this.liveKitRoom.localParticipant);

    // Set up all other users
    this.liveKitRoom.participants.forEach((participant) => {
      this.onParticipantConnected(participant);
    });
  }

  async attachAudioTrack(userId, userAudioTrack, audioElement) {
    if (userAudioTrack.attachedElements.includes(audioElement)) {
      log.debug("Audio track", userAudioTrack, "already attached to element", audioElement, "; skipping");
      return;
    }

    // Set audio output device
    if (audioElement.sinkId === undefined) {
      log.warn("Your web browser does not support output audio sink selection");
    } else {
      const requestedSink = this.settings.get("client", "audioSink");
      await audioElement.setSinkId(requestedSink).catch((error) => {
        log.warn("An error occurred when requesting the output audio device:", requestedSink, error.message);
      });
    }

    // Detach from any existing elements
    userAudioTrack.detach();

    // Attach the audio track
    userAudioTrack.attach(audioElement);

    // Set the parameters
    audioElement.volume = this.settings.getUser(userId).volume;
    audioElement.muted = this.settings.get("client", "muteAll");
  }

  attachVideoTrack(userVideoTrack, videoElement) {
    if (userVideoTrack.attachedElements.includes(videoElement)) {
      log.debug("Video track", userVideoTrack, "already attached to element", videoElement, "; skipping");
      return;
    }

    // Detach from any existing elements
    userVideoTrack.detach();

    // Attach to the video element
    userVideoTrack.attach(videoElement);
  }

  async changeAudioSource() {
    if (!this.audioTrack || this.settings.get("client", "audioSrc") === "disabled") {
      if (this.audioTrack) {
        await this.liveKitRoom.localParticipant.unpublishTrack(this.audioTrack);
        this.audioTrack.stop();
        this.audioTrack = null;
      } else {
        await this.initializeAudioTrack();
        if (this.audioTrack) {
          await this.liveKitRoom.localParticipant.publishTrack(this.audioTrack);
        }
      }
    } else {
      this.audioTrack.restartTrack(this.getAudioParams());
    }
  }

  async changeVideoSource() {
    if (!this.videoTrack || this.settings.get("client", "videoSrc") === "disabled") {
      if (this.videoTrack) {
        await this.liveKitRoom.localParticipant.unpublishTrack(this.videoTrack);
        this.videoTrack.detach();
        this.videoTrack.stop();
        this.videoTrack = null;
      } else {
        await this.initializeVideoTrack();
        if (this.videoTrack) {
          await this.liveKitRoom.localParticipant.publishTrack(this.videoTrack);
          this.attachVideoTrack(this.videoTrack, ui.webrtc.getUserVideoElement(game.user.id))
        }
      }
    } else {
      this.videoTrack.restartTrack(this.getVideoParams());
    }
  }

  getAccessToken(apiKey, secretKey, roomName, userName, fvttUserId) {
    const accessToken = new LiveKit.AccessToken(apiKey, secretKey, {
      ttl: "10h",
      identity: userName,
      metadata: fvttUserId,
    });
    accessToken.addGrant({ roomJoin: true, room: roomName });

    const accessTokenJwt = accessToken.toJwt();
    log.debug("AccessToken:", accessTokenJwt);
    return accessTokenJwt;
  }

  getAudioParams() {
    // Determine whether the user can send audio
    const audioSrc = this.settings.get("client", "audioSrc");
    const canBroadcastAudio = this.avMaster.canUserBroadcastAudio(game.user.id);
    return (audioSrc && audioSrc !== "disabled" && canBroadcastAudio) ? {
      deviceId: { ideal: audioSrc },
    } : false;
  }

  getParticipantAudioTrack(userId) {
    let audioTrack = null;
    this.liveKitParticipants.get(userId).audioTracks.forEach((publication) => {
      if (publication.kind === LiveKit.Track.Kind.Audio) {
        audioTrack = publication.track;
      }
    });
    return audioTrack;
  }

  getParticipantVideoTrack(userId) {
    let videoTrack = null;
    this.liveKitParticipants.get(userId).videoTracks.forEach((publication) => {
      if (publication.kind === LiveKit.Track.Kind.Video) {
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
   * @return {HTMLVideoElement|null}
   */
  getUserAudioElement(userId, videoElement = null) {
    // Find an existing audio element
    let audioElement = ui.webrtc.element.find(`.camera-view[data-user=${userId}] audio.user-audio`)[0];

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "user-audio";
      audioElement.autoplay = true;
      videoElement.after(audioElement);

      // Bind volume control
      ui.webrtc.element.find(`.camera-view[data-user=${userId}] .webrtc-volume-slider`).change(this.onVolumeChange.bind(this));
    }

    return audioElement;
  }

  async initializeLocalTracks() {
    await this.initializeAudioTrack();
    await this.initializeVideoTrack();
  }

  async initializeAudioTrack() {
    // Make sure the track is initially unset
    this.audioTrack = null;

    // Get audio parameters
    const audioParams = this.getAudioParams();

    // Get the track if requested
    if (audioParams) {
      try {
        this.audioTrack = await LiveKit.createLocalAudioTrack(audioParams);
      } catch (error) {
        log.error("Unable to acquire local audio:", error.message);
      }
    }

    // Check that mute/hidden/broadcast is toggled properly for the track
    if (this.audioTrack
      && !(this.liveKitAvClient.isVoiceAlways && this.avMaster.canUserShareAudio(game.user.id))) {
      this.audioTrack.mute();
    }
  }

  async initializeVideoTrack() {
    // Make sure the track is initially unset
    this.videoTrack = null;

    // Get video parameters
    const videoParams = this.getVideoParams();

    // Get the track if requested
    if (videoParams) {
      try {
        this.videoTrack = await LiveKit.createLocalVideoTrack(videoParams);
      } catch (error) {
        log.error("Unable to acquire local video:", error.message);
      }
    }

    // Check that mute/hidden/broadcast is toggled properly for the track
    if (this.videoTrack
      && !this.avMaster.canUserShareVideo(game.user.id)) {
      this.videoTrack.mute();
    }
  }

  onIsSpeakingChanged(userId, speaking) {
    ui.webrtc.setUserIsSpeaking(userId, speaking);
  }

  onParticipantConnected(participant) {
    log.debug("Participant connected:", participant);

    // Save the participant to the ID mapping
    this.liveKitParticipants.set(participant.metadata, participant);

    // Set up remote participant callbacks
    this.setRemoteParticipantCallbacks(participant);

    // Call a debounced render
    this.render();
  }

  onParticipantDisconnected(participant) {
    log.debug("Participant disconnected:", participant);

    // Remove the participant from the ID mapping
    this.liveKitParticipants.delete(participant.metadata);

    // Call a debounced render
    this.render();
  }

  async onTrackSubscribed(track, publication, participant) {
    log.debug("onTrackSubscribed:", track, publication, participant);
    const userId = participant.metadata;
    const videoElement = ui.webrtc.getUserVideoElement(userId);

    if (!videoElement) {
      log.debug("videoElement not yet ready for", userId, "; skipping publication", publication);
      return;
    }

    if (publication.kind === LiveKit.Track.Kind.Audio) {
      // Get the audio element for the user
      const audioElement = this.getUserAudioElement(userId, videoElement);
      await this.attachAudioTrack(userId, track, audioElement);
    } else if (publication.kind === LiveKit.Track.Kind.Video) {
      this.attachVideoTrack(track, videoElement);
    } else {
      log.warn("Unknown track type subscribed from publication", publication);
    }
  }

  async onTrackUnSubscribed(track, publication, participant) {
    log.debug("onTrackUnSubscribed:", track, publication, participant);
    await track.detach();
  }

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   */
  onVolumeChange(event) {
    const input = event.currentTarget;
    const box = input.closest(".camera-view");
    const volume = AudioHelper.inputToVolume(input.value);
    box.getElementsByTagName("audio")[0].volume = volume;
  }

  getVideoParams() {
    // Configure whether the user can send video
    const videoSrc = this.settings.get("client", "videoSrc");
    const canBroadcastVideo = this.avMaster.canUserBroadcastVideo(game.user.id);
    return (videoSrc && videoSrc !== "disabled" && canBroadcastVideo) ? {
      deviceId: { ideal: videoSrc },
      width: { ideal: 320 },
      height: { ideal: 240 },
    } : false;
  }

  setAudioEnabledState(enable) {
    if (!this.audioTrack) {
      log.debug("setAudioEnabledState called but no audio track available");
      return;
    }

    if (!enable) {
      log.debug("Muting audio track", this.audioTrack);
      this.audioTrack.mute();
    } else {
      log.debug("Un-muting audio track", this.audioTrack);
      this.audioTrack.unmute();
    }
  }

  setLocalParticipantCallbacks() {
    this.liveKitRoom.localParticipant
      .on(LiveKit.ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, game.user.id))
      .on(LiveKit.ParticipantEvent.TrackPublished, (...args) => { log.debug("Local ParticipantEvent TrackPublished:", args); });
  }

  setLocalTrackCallbacks() {
    // Set up local track callbacks
    this.liveKitRoom.localParticipant.tracks.forEach((publication) => {
      const { track } = publication;
      track
        .on(LiveKit.TrackEvent.Muted, (...args) => { log.debug("Local TrackEvent Muted:", args); })
        .on(LiveKit.TrackEvent.Unmuted, (...args) => { log.debug("Local TrackEvent Unmuted:", args); });
    });
  }

  setRemoteParticipantCallbacks(participant) {
    participant
      .on(LiveKit.ParticipantEvent.IsSpeakingChanged,
        this.onIsSpeakingChanged.bind(this, participant.metadata));
  }

  setRoomCallbacks() {
    // Set up event callbacks
    this.liveKitRoom
      .on(LiveKit.RoomEvent.ParticipantConnected, this.onParticipantConnected.bind(this))
      .on(LiveKit.RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected.bind(this))
      .on(LiveKit.RoomEvent.TrackPublished, (...args) => { log.debug("RoomEvent TrackPublished:", args); })
      .on(LiveKit.RoomEvent.TrackSubscribed, this.onTrackSubscribed.bind(this))
      .on(LiveKit.RoomEvent.TrackUnpublished, (...args) => { log.debug("RoomEvent TrackUnpublished:", args); })
      .on(LiveKit.RoomEvent.TrackUnsubscribed, this.onTrackUnSubscribed.bind(this))
      .on(LiveKit.RoomEvent.Disconnected, (...args) => { log.debug("RoomEvent Disconnected:", args); })
      .on(LiveKit.RoomEvent.Reconnecting, () => { log.warn("Reconnecting to room"); })
      .on(LiveKit.RoomEvent.TrackMuted, (...args) => { log.debug("RoomEvent TrackMuted:", args); })
      .on(LiveKit.RoomEvent.TrackUnmuted, (...args) => { log.debug("RoomEvent TrackUnmuted:", args); })
      .on(LiveKit.RoomEvent.Reconnected, () => { log.info("Reconnected to room"); });
  }
}
