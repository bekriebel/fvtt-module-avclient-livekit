import { AudioPresets, VideoPresets43 } from "livekit-client";

export const VIDEO_PRESETS_ORDERED = [
  { key: "h180", preset: VideoPresets43.h180 },
  { key: "h360", preset: VideoPresets43.h360 },
  { key: "h540", preset: VideoPresets43.h540 },
  { key: "h720", preset: VideoPresets43.h720 },
] as const;

export const RESOLUTION_CHOICES: Record<string, string> = {
  h180: "180p",
  h360: "360p",
  h540: "540p",
  h720: "720p",
};

export const DEFAULT_VIDEO_CODEC = "vp8";

export const DEFAULT_AUDIO_PRESET = AudioPresets.speech;

export const DEFAULT_SIMULCAST = true;
