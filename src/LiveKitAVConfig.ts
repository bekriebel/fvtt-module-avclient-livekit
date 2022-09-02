import { LiveKitSettingsConfig } from "../types/avclient-livekit";
import LiveKitClient from "./LiveKitClient";
import { MODULE_NAME } from "./utils/constants";
import { getGame, isVersion10AV } from "./utils/helpers";
import * as log from "./utils/logging";

export default class LiveKitAVConfig extends AVConfig {
  /** @override */
  static get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      template: "modules/avclient-livekit/templates/av-config.html",
    });
  }

  _getLiveKitSettings() {
    const gs = getGame().settings;
    const canConfigure = getGame().user?.can("SETTINGS_MODIFY");

    const liveKitSettings = [];

    for (const setting of gs.settings.values()) {
      if (
        setting.namespace !== MODULE_NAME ||
        !setting.config ||
        (!canConfigure && setting.scope !== "client")
      )
        continue;

      // Update setting data
      const s: LiveKitSettingsConfig = foundry.utils.deepClone(setting);
      s.id = `${s.namespace}.${s.key}`;
      s.name = getGame().i18n.localize(s.name || "");
      s.hint = getGame().i18n.localize(s.hint || "");
      s.value = getGame().settings.get(s.namespace, s.key);
      s.settingType =
        setting.type instanceof Function ? setting.type.name : "String";
      s.isCheckbox = setting.type === Boolean;
      s.isSelect = s.choices !== undefined;
      s.isRange = setting.type === Number && s.range;
      s.isNumber = setting.type === Number;
      s.filePickerType = s.filePicker === true ? "any" : s.filePicker;

      liveKitSettings.push(s);
    }

    return liveKitSettings;
  }

  /** @override */
  async getData(
    options: Partial<FormApplicationOptions>
  ): Promise<AVConfig.Data> {
    const data = await super.getData(options);

    return mergeObject(data, {
      isVersion10AV: isVersion10AV(),
      liveKitServerTypes:
        getGame().webrtc?.client._liveKitClient.liveKitServerTypes,
      liveKitSettings: this._getLiveKitSettings(),
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
        ".livekit-details",
        liveKitServerType.details !== undefined
      );
      if (liveKitServerType.details !== undefined) {
        this._setSectionParagraphHtml(
          ".livekit-details",
          getGame().i18n.localize(liveKitServerType.details)
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
      ".livekit-details",
      liveKitServerType.details !== undefined
    );
    if (liveKitServerType.details !== undefined) {
      this._setSectionParagraphHtml(
        ".livekit-details",
        getGame().i18n.localize(liveKitServerType.details)
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

  _setSectionParagraphHtml(selector: string, value = "") {
    const section = this.element.find(selector);
    if (section) {
      section.find("p").html(value);
    }
  }

  /** @override */
  async _updateObject(event: Event, formData: object) {
    for (const [k, v] of Object.entries(
      foundry.utils.flattenObject(formData)
    )) {
      const s = getGame().settings.settings.get(k);
      if (s?.namespace !== MODULE_NAME) continue;
      const current = getGame().settings.get(s.namespace, s.key);
      if (v === current) continue;
      await getGame().settings.set(s.namespace, s.key, v);
    }

    await super._updateObject(event, formData);
  }
}
