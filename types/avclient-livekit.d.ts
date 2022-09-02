import LiveKitAVClient from "../src/LiveKitAVClient";

/**
 * Interfaces
 */

// LiveKit connection settings
interface ConnectionSettings {
  type: string;
  url: string;
  room: string;
  username: string;
  password: string;
}

interface LiveKitServerType {
  key: string;
  label: string;
  details?: string;
  url?: string;
  urlRequired: boolean;
  usernameRequired: boolean;
  passwordRequired: boolean;
  tokenFunction: LiveKitTokenFunction;
}

interface LiveKitServerTypes {
  [key: string]: LiveKitServerType;
}

interface LiveKitTokenFunction {
  (
    apiKey: string,
    secretKey: string,
    roomName: string,
    userName: string,
    metadata: string
  ): Promise<string>;
}

// Custom voice modes to remove ACTIVITY
interface LiveKitVoiceModes {
  ALWAYS: "always";
  PTT: "ptt";
}

// Custom foundry socket message
interface SocketMessage {
  action: "breakout" | "connect" | "disconnect" | "render";
  userId?: string;
  breakoutRoom?: string;
}

/**
 * Types
 */

type LiveKitSettingsConfig = SettingConfig & {
  id?: string;
  value?: unknown;
  settingType?: string;
  isCheckbox?: boolean;
  isSelect?: boolean;
  isRange?: boolean;
  isNumber?: boolean;
  filePickerType?: string;
};

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
