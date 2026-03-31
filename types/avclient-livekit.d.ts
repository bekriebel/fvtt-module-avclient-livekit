import LiveKitAVClient from "../src/LiveKitAVClient";
/**
 * Interfaces
 */

// LiveKit connection settings
interface LiveKitConnectionSettings {
  serverType?: string;
  url?: string;
  room?: string;
  username?: string;
  password?: string;
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

type LiveKitServerTypes = Record<string, LiveKitServerType>;

type LiveKitTokenFunction = (
  apiKey?: string,
  secretKey?: string,
  roomName: string,
  userName: string,
  metadata: string,
) => Promise<string>;

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

type BreakoutRoomRegistry = Record<string, string | undefined>;

/**
 * Global settings
 */

// Set game.webrtc.client to LiveKitAVClient
declare global {
  interface WebRTCConfig {
    clientClass: typeof LiveKitAVClient;
  }

  // Add settings for the module
  interface SettingConfig {
    "avclient-livekit.liveKitConnectionSettings": LiveKitConnectionSettings;
    "avclient-livekit.breakoutRoomRegistry": BreakoutRoomRegistry;
    "avclient-livekit.displayConnectionQuality": foundry.data.fields.BooleanField<{
      initial: true;
    }>;
    "avclient-livekit.videoResolution": foundry.data.fields.StringField<{
      initial: "h360";
    }>;
    "avclient-livekit.videoBitrate": foundry.data.fields.NumberField<{
      initial: 0;
      min: 0;
      max: 2500;
      step: 100;
    }>;
    "avclient-livekit.audioBitrate": foundry.data.fields.NumberField<{
      initial: 0;
      min: 0;
      max: 128;
      step: 8;
    }>;
    "avclient-livekit.enableNoiseCancellation": foundry.data.fields.BooleanField<{
      initial: true;
    }>;
    "avclient-livekit.audioMusicMode": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.useExternalAV": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.resetRoom": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.debug": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.devMode": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.authServer": foundry.data.fields.StringField<{
      required: true;
      blank: false;
      initial: string;
    }>;
    "avclient-livekit.liveKitTrace": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.forceTurn": foundry.data.fields.BooleanField<{
      initial: false;
    }>;
    "avclient-livekit.tavernPatreonToken": foundry.data.fields.StringField<{
      required: false;
      blank: true;
      initial: string;
    }>;
  }
}
