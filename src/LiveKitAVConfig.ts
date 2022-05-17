import LiveKitClient from "./LiveKitClient";
import { getGame } from "./utils/helpers";
import * as log from "./utils/logging";

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
    const liveKitClient = getGame().webrtc?.client._liveKitClient;

    if (liveKitClient instanceof LiveKitClient) {
      const liveKitServerTypeKey = settings.get("world", "livekit.type");
      let liveKitServerType = liveKitClient.defaultLiveKitServerType;
      if (
        typeof liveKitServerTypeKey === "string" &&
        liveKitClient.liveKitServerTypes[liveKitServerTypeKey] !== undefined
      ) {
        liveKitServerType =
          liveKitClient.liveKitServerTypes[liveKitServerTypeKey];
      } else {
        log.warn(
          "liveKitServerType",
          liveKitServerTypeKey,
          "not found; defaulting to",
          liveKitClient.defaultLiveKitServerType.key
        );
      }

      this._setConfigSectionVisible(
        ".livekit-url",
        liveKitServerType.urlRequired
      );
      this._setConfigSectionVisible(
        ".livekit-username",
        liveKitServerType.usernameRequired
      );
      this._setConfigSectionVisible(
        ".livekit-password",
        liveKitServerType.passwordRequired
      );
    } else {
      log.warn("activateListeners: liveKitClient not yet available");
    }
  }

  _onLiveKitTypeChanged(event: JQuery.ChangeEvent) {
    event.preventDefault();
    const choice = event.currentTarget.value;
    const liveKitServerType =
      getGame().webrtc?.client._liveKitClient.liveKitServerTypes[choice];

    if (!liveKitServerType) {
      log.warn("liveKitServerType", choice, "not found");
      return;
    }

    this._setConfigSectionVisible(
      ".livekit-url",
      liveKitServerType.urlRequired
    );
    this._setConfigSectionVisible(
      ".livekit-username",
      liveKitServerType.usernameRequired
    );
    this._setConfigSectionVisible(
      ".livekit-password",
      liveKitServerType.passwordRequired
    );
  }

  _setConfigSectionVisible(selector: string, enabled = true) {
    const section = this.element.find(selector);
    if (section) {
      enabled ? section.show() : section.hide();
    }
    this.setPosition(this.position);
  }

  _setConfigSectionEditable(selector: string, enabled = true) {
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
