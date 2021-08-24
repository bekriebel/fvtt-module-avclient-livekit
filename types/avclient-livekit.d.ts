import LiveKitAVClient from "../src/LiveKitAVClient";

/**
 * Interfaces
 */

// Custom voice modes to remove ACTIVITY
interface LiveKitVoiceModes {
  ALWAYS: "always";
  PTT: "ptt";
}

export interface ConnectionSettings {
  type: string;
  url: string;
  room: string;
  username: string;
  password: string;
}

/**
 * Global settings
 */

// Set AVSettings.VoiceModes to custom type
declare global {
  namespace AVSettings {
    interface Overrides {
      VoiceModes: LiveKitVoiceModes;
    }
  }
}

// Set game.webrtc.client to LiveKitAVClient
declare global {
  interface WebRTCConfig {
    clientClass: typeof LiveKitAVClient;
  }
}
