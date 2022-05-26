import { getGame } from "./utils/helpers";

/**
 * The Camera UI View that displays all the camera feeds as individual video elements.
 * @type {CameraViews}
 *
 * @param {WebRTC} webrtc                 The WebRTC Implementation to display
 * @param {ApplicationOptions} [options]  Application configuration options.
 */
export default class LiveKitCameraViews extends CameraViews {
  /** @override */
  static get defaultOptions(): ApplicationOptions {
    return mergeObject(super.defaultOptions, {
      template: "modules/avclient-livekit/templates/camera-views.html",
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * On clicking on a toggle, disable/enable the audio or video stream.
   * @event {MouseEvent} event   The originating click event
   * @private
   */
  /** @override */
  async _onClickControl(event: JQuery.ClickEvent): Promise<void> {
    event.preventDefault();

    // Reference relevant data
    const button = event.currentTarget;
    const action = button.dataset.action;
    const view = button.closest(".camera-view");
    const user = getGame().users?.get(view.dataset.user);
    const settings = this.webrtc?.settings;
    const userActivity = getGame().webrtc?.settings.activity[user?.id || ""];
    const userSettings = settings?.getUser(user?.id || "");

    // Handle different actions
    switch (action) {
      // Globally block video
      case "block-video": {
        if (!getGame().user?.isGM) break;
        await user?.update({
          "permissions.BROADCAST_VIDEO": !userSettings?.canBroadcastVideo,
        });
        this._refreshView(view);
        break;
      }

      // Globally block audio
      case "block-audio": {
        if (!getGame().user?.isGM) break;
        await user?.update({
          "permissions.BROADCAST_AUDIO": !userSettings?.canBroadcastAudio,
        });
        this._refreshView(view);
        break;
      }

      // Toggle video display
      case "toggle-video": {
        if (!user?.isSelf) break;
        if (userSettings?.hidden && !userSettings.canBroadcastVideo) {
          return ui.notifications?.warn("WEBRTC.WarningCannotEnableVideo", {
            localize: true,
          });
        }
        settings?.set(
          "client",
          `users.${user.id}.hidden`,
          !userSettings?.hidden
        );
        this._refreshView(view);
        break;
      }

      // Toggle audio output
      case "toggle-audio":
        if (!user?.isSelf) break;
        if (userSettings?.muted && !userSettings.canBroadcastAudio) {
          return ui.notifications?.warn("WEBRTC.WarningCannotEnableAudio", {
            localize: true,
          });
        }
        settings?.set("client", `users.${user.id}.muted`, !userSettings?.muted);
        this._refreshView(view);
        break;

      // Toggle video display
      case "toggle-receive-video": {
        if (user?.isSelf) break;
        if (!userSettings?.canBroadcastVideo) {
          return ui.notifications?.warn(
            "WEBRTC.WarningCannotBroadcastUserVideo",
            {
              localize: true,
            }
          );
        }
        if (userActivity?.hidden) {
          return ui.notifications?.warn("WEBRTC.WarningCannotEnableUserVideo", {
            localize: true,
          });
        }
        settings?.set(
          "client",
          `users.${user?.id}.hidden`,
          !userSettings?.hidden
        );
        this.render();
        break;
      }

      // Toggle audio output
      case "toggle-receive-audio":
        if (user?.isSelf) break;
        if (!userSettings?.canBroadcastAudio) {
          return ui.notifications?.warn(
            "WEBRTC.WarningCannotBroadcastUserAudio",
            {
              localize: true,
            }
          );
        }
        if (userActivity?.muted) {
          return ui.notifications?.warn("WEBRTC.WarningCannotEnableUserAudio", {
            localize: true,
          });
        }
        settings?.set(
          "client",
          `users.${user?.id}.muted`,
          !userSettings?.muted
        );
        this.render();
        break;

      // Toggle mute all peers
      case "mute-peers":
        if (!user?.isSelf) break;
        settings?.set("client", "muteAll", !settings.client.muteAll);
        this._refreshView(view);
        break;

      // Configure settings
      case "configure":
        this.webrtc?.config.render(true);
        return;

      // Toggle popout
      case "toggle-popout":
        await settings?.set(
          "client",
          `users.${user?.id}.popout`,
          !userSettings?.popout
        );
        this.render();
        return;

      // Hide players
      case "toggle-players":
        await settings?.set(
          "client",
          "hidePlayerList",
          !settings.client.hidePlayerList
        );
        this.render();
        return;

      // Cycle camera size
      case "change-size": {
        const sizes = ["large", "medium", "small"];
        const size = sizes.indexOf(settings?.client.dockSize || "");
        const next = size + 1 >= sizes.length ? 0 : size + 1;
        settings?.set("client", "dockSize", sizes[next]);
        this.render();
        return;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Internal Helpers                            */
  /* -------------------------------------------- */

  /**
   * Dynamically refresh the state of a single camera view
   * @param {HTMLElement} view      The view container div
   * @private
   */
  /** @override */
  _refreshView(view: HTMLElement): void {
    const userId = view.dataset.user || "";
    const isSelf = getGame().user?.id === userId;
    const clientSettings = getGame().webrtc?.settings.client;
    const userSettings = getGame().webrtc?.settings.getUser(userId);

    // Identify permissions
    const cbv = getGame().webrtc?.canUserBroadcastVideo(userId) || false;
    const csv = getGame().webrtc?.canUserShareVideo(userId) || false;
    const cba = getGame().webrtc?.canUserBroadcastAudio(userId) || false;
    const csa = getGame().webrtc?.canUserShareAudio(userId) || false;

    // Refresh video display
    const video = view.querySelector("video.user-camera") as HTMLVideoElement;
    const avatar = view.querySelector("img.user-avatar") as HTMLImageElement;

    if (video && avatar) {
      video.style.visibility = csv ? "visible" : "hidden";
      video.style.display = csv ? "block" : "none";
      avatar.style.display = csv ? "none" : "unset";
    }

    // Hidden and muted status icons
    view.querySelector(".status-hidden")?.classList.toggle("hidden", csv);
    view.querySelector(".status-muted")?.classList.toggle("hidden", csa);

    // Volume bar and video output volume
    video.volume = userSettings?.volume || 1.0;
    video.muted = isSelf || clientSettings?.muteAll || false; // Mute your own video
    const volBar = view.querySelector(".volume-bar") as HTMLInputElement;
    const displayBar = userId !== getGame().user?.id && cba;
    volBar.style.display = displayBar ? "block" : "none";
    volBar.disabled = !displayBar;

    // Control toggle states
    const actions: {
      [key: string]: {
        state: boolean;
        display: boolean | undefined;
      };
    } = {
      "block-video": { state: !cbv, display: getGame().user?.isGM && !isSelf },
      "block-audio": { state: !cba, display: getGame().user?.isGM && !isSelf },
      "toggle-video": { state: !csv, display: isSelf },
      "toggle-audio": { state: !csa, display: isSelf },
      "toggle-receive-video": {
        state: !!userSettings?.hidden,
        display: !isSelf && cbv,
      },
      "toggle-receive-audio": {
        state: !!userSettings?.muted,
        display: !isSelf && cba,
      },
      "mute-peers": {
        state: clientSettings?.muteAll || false,
        display: isSelf,
      },
      "toggle-players": {
        state: !clientSettings?.hidePlayerList,
        display: isSelf,
      },
    };
    const toggles =
      view.querySelectorAll<HTMLFormElement>(".av-control.toggle");
    for (const button of toggles) {
      const action = button.dataset.action;
      if (!action || !(action in actions)) continue;
      const state = actions[action].state;
      const displayed = actions[action].display;
      button.style.display = displayed ? "block" : "none";
      button.enabled = displayed;
      button.children[0].classList.remove(
        this._getToggleIcon(action, !state) || ""
      );
      button.children[0].classList.add(
        this._getToggleIcon(action, state) || ""
      );
      button.setAttribute("title", this._getToggleTooltip(action, state));
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the icon class that should be used for various action buttons with different toggled states.
   * The returned icon should represent the visual status of the NEXT state (not the CURRENT state).
   *
   * @param {string} action     The named av-control button action
   * @param {boolean} state     The CURRENT action state.
   * @return {string}           The icon that represents the NEXT action state.
   * @private
   */
  /** @override */
  _getToggleIcon(action: string, state: boolean) {
    const actionMapping: {
      [key: string]: [string, string];
    } = {
      "block-video": ["fa-video", "fa-video-slash"], // True means "blocked"
      "block-audio": ["fa-microphone", "fa-microphone-slash"], // True means "blocked"
      "toggle-video": ["fa-video", "fa-video-slash"], // True means "enabled"
      "toggle-audio": ["fa-microphone", "fa-microphone-slash"], // True means "enabled"
      "toggle-receive-video": ["fa-video", "fa-video-slash"], // True means "enabled"
      "toggle-receive-audio": ["fa-microphone", "fa-microphone-slash"], // True means "enabled"
      "mute-peers": ["fa-volume-up", "fa-volume-mute"], // True means "muted"
      "toggle-players": ["fa-caret-square-right", "fa-caret-square-left"], // True means "displayed"
    };
    const icons = actionMapping[action];
    return icons ? icons[state ? 1 : 0] : null;
  }

  /* -------------------------------------------- */

  /**
   * Get the text title that should be used for various action buttons with different toggled states.
   * The returned title should represent the tooltip of the NEXT state (not the CURRENT state).
   *
   * @param {string} action     The named av-control button action
   * @param {boolean} state     The CURRENT action state.
   * @return {string}           The icon that represents the NEXT action state.
   * @private
   */
  /** @override */
  _getToggleTooltip(action: string, state: boolean) {
    const actionMapping: {
      [key: string]: [string, string];
    } = {
      "block-video": ["BlockUserVideo", "AllowUserVideo"], // True means "blocked"
      "block-audio": ["BlockUserAudio", "AllowUserAudio"], // True means "blocked"
      "toggle-video": ["DisableMyVideo", "EnableMyVideo"], // True means "enabled"
      "toggle-audio": ["DisableMyAudio", "EnableMyAudio"], // True means "enabled"
      "toggle-receive-video": ["DisableUserVideo", "EnableUserVideo"], // True means "enabled"
      "toggle-receive-audio": ["DisableUserAudio", "EnableUserAudio"], // True means "enabled"
      "mute-peers": ["MutePeers", "UnmutePeers"], // True means "muted"
      "toggle-players": ["ShowPlayers", "HidePlayers"], // True means "displayed"
    };
    const labels = actionMapping[action];
    return getGame().i18n.localize(
      `WEBRTC.Tooltip${labels ? labels[state ? 1 : 0] : ""}`
    );
  }
}
