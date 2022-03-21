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
    });
  }
}
