import { getGame } from "./utils/helpers";

export default class LiveKitAVConfig extends AVConfig {
  /** @override */
  static get defaultOptions(): AVConfig.Options {
    return mergeObject(super.defaultOptions, {
      template: "modules/avclient-livekit/templates/av-config.html",
    });
  }

  /** @override */
  async getData(options: Partial<AVConfig.Options>): Promise<AVConfig.Data> {
    const data = await super.getData(options);

    return mergeObject(data, {
      isVersion9: getGame().webrtc?.client._liveKitClient.isVersion9,
    });
  }
}
