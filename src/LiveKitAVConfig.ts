import { getGame } from "./utils/helpers";

export default class LiveKitAVConfig extends AVConfig {
  /** @override */
  static get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      template: "modules/avclient-livekit/templates/av-config.html",
    });
  }

  /** @override */
  async getData(
    options: Partial<FormApplicationOptions>
  ): Promise<AVConfig.Data> {
    const data = await super.getData(options);

    return mergeObject(data, {
      isVersion9: getGame().webrtc?.client._liveKitClient.isVersion9,
      liveKitServerTypes:
        getGame().webrtc?.client._liveKitClient.liveKitServerTypes,
    });
  }

  /** @override */
  activateListeners(html: JQuery<HTMLElement>) {
    super.activateListeners(html);

    // Options below are GM only
    if (!getGame().user?.isGM) return;
    html
      .find('select[name="world.livekit.type"]')
      .on("change", this._onLiveKitTypeChanged.bind(this));

    const settings = this.object.settings;
    const liveKitServerConfig =
      getGame().webrtc?.client._liveKitClient.liveKitServerTypes[
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        settings.world.livekit.type
      ];

    if (!liveKitServerConfig) {
      return;
    }

    this._setConfigSectionReadOnly(
      ".livekit-url",
      liveKitServerConfig.urlRequired
    );
    this._setConfigSectionEnabled(
      ".livekit-username",
      liveKitServerConfig.usernameRequired
    );
    this._setConfigSectionEnabled(
      ".livekit-password",
      liveKitServerConfig.passwordRequired
    );
  }

  _onLiveKitTypeChanged(event: JQuery.ChangeEvent) {
    event.preventDefault();
    const choice = event.currentTarget.value;
    const liveKitServerConfig =
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      getGame().webrtc?.client._liveKitClient.liveKitServerTypes[choice];

    if (!liveKitServerConfig) {
      return;
    }

    if (!liveKitServerConfig.urlRequired) {
      this._setConfigSectionValue(".livekit-url", liveKitServerConfig.url);
    }

    this._setConfigSectionReadOnly(
      ".livekit-url",
      liveKitServerConfig.urlRequired
    );
    this._setConfigSectionEnabled(
      ".livekit-username",
      liveKitServerConfig.usernameRequired
    );
    this._setConfigSectionEnabled(
      ".livekit-password",
      liveKitServerConfig.passwordRequired
    );
  }

  _setConfigSectionReadOnly(selector: string, enabled = true) {
    const section = this.element.find(selector);
    if (section) {
      section.css("opacity", enabled ? 1.0 : 0.5);
      section.find("input").prop("readonly", !enabled);
    }
  }

  _setConfigSectionValue(selector: string, value = "") {
    const section = this.element.find(selector);
    if (section) {
      section.find("input").val(value);
    }
  }
}
