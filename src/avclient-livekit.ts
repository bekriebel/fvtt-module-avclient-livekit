import "./utils/hooks";
import LiveKitAVClient from "./LiveKitAVClient";
import LiveKitCameraViews from "./LiveKitCameraViews";

CONFIG.WebRTC.clientClass = LiveKitAVClient;
CONFIG.ui.webrtc = LiveKitCameraViews;
