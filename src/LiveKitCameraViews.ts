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
}
