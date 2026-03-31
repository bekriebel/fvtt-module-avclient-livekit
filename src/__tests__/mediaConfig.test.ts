import { describe, it, expect, vi } from "vitest";

// Mock livekit-client before importing
vi.mock("livekit-client", () => ({
  VideoPresets43: {
    h180: { resolution: { width: 240, height: 180 } },
    h360: { resolution: { width: 480, height: 360 } },
    h540: { resolution: { width: 720, height: 540 } },
    h720: { resolution: { width: 960, height: 720 } },
  },
  AudioPresets: {
    speech: { maxBitrate: 24000 },
  },
}));

import {
  VIDEO_PRESETS_ORDERED,
  RESOLUTION_CHOICES,
  DEFAULT_VIDEO_CODEC,
  DEFAULT_AUDIO_PRESET,
  DEFAULT_SIMULCAST,
} from "../LiveKitMediaConfig";

describe("LiveKitMediaConfig", () => {
  describe("VIDEO_PRESETS_ORDERED", () => {
    it("should have 4 presets in ascending resolution order", () => {
      expect(VIDEO_PRESETS_ORDERED).toHaveLength(4);
      expect(VIDEO_PRESETS_ORDERED.map((p) => p.key)).toEqual([
        "h180",
        "h360",
        "h540",
        "h720",
      ]);
    });

    it("should have presets with increasing height", () => {
      const heights = VIDEO_PRESETS_ORDERED.map(
        (p) => p.preset.resolution.height,
      );
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i]).toBeGreaterThan(heights[i - 1]);
      }
    });
  });

  describe("RESOLUTION_CHOICES", () => {
    it("should have matching keys with VIDEO_PRESETS_ORDERED", () => {
      const presetKeys = VIDEO_PRESETS_ORDERED.map((p) => p.key);
      const choiceKeys = Object.keys(RESOLUTION_CHOICES);
      expect(choiceKeys).toEqual(presetKeys);
    });

    it("should have human-readable labels", () => {
      expect(RESOLUTION_CHOICES["h360"]).toBe("360p");
      expect(RESOLUTION_CHOICES["h720"]).toBe("720p");
    });
  });

  describe("defaults", () => {
    it("should use vp8 as default codec", () => {
      expect(DEFAULT_VIDEO_CODEC).toBe("vp8");
    });

    it("should use speech as default audio preset", () => {
      expect(DEFAULT_AUDIO_PRESET).toBeDefined();
      expect(DEFAULT_AUDIO_PRESET.maxBitrate).toBeGreaterThan(0);
    });

    it("should enable simulcast by default", () => {
      expect(DEFAULT_SIMULCAST).toBe(true);
    });
  });
});
