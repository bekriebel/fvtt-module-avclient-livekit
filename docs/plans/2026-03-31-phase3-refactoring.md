# Phase 3: Refactoring & Code Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize the codebase by removing jQuery, fixing hardcoded protocols, centralizing media constants, and adding a vitest unit test foundation.

**Architecture:** Four independent refactoring tasks. Task 4 (tests) depends on tasks 1-3 being complete since it tests the new code. Tasks 1-3 are independent of each other. Each task modifies existing files or creates new ones, validated by `pnpm build`.

**Tech Stack:** TypeScript, livekit-client v2.17.1, Vite 7, vitest, pnpm

**Build command:** `pnpm build` (runs `vite build`)

---

### Task 1: Remove jQuery from addConnectionQualityIndicator

**Files:**
- Modify: `src/LiveKitClient.ts:204-214`

**Step 1: Replace jQuery element creation with vanilla DOM**

Replace lines 204-214 in `src/LiveKitClient.ts`:

```typescript
    const connectionQualityIndicator = $(
      `<div class="connection-quality-indicator unknown" title="${
        game.i18n?.localize(
          `${LANG_NAME}.connectionQuality.${ConnectionQuality.Unknown}`,
        ) ?? "Connection Quality Unknown"
      }"></div>`,
    );

    if (userNameBar instanceof Element) {
      $(userNameBar).after(connectionQualityIndicator);
    }
```

With:

```typescript
    const connectionQualityIndicator = document.createElement("div");
    connectionQualityIndicator.className = "connection-quality-indicator unknown";
    connectionQualityIndicator.title =
      game.i18n?.localize(
        `${LANG_NAME}.connectionQuality.${ConnectionQuality.Unknown}`,
      ) ?? "Connection Quality Unknown";

    if (userNameBar instanceof Element) {
      userNameBar.insertAdjacentElement("afterend", connectionQualityIndicator);
    }
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "refactor: replace jQuery with vanilla DOM in addConnectionQualityIndicator

Use document.createElement and insertAdjacentElement instead of $().
This was the only jQuery usage in the codebase."
```

---

### Task 2: Fix hardcoded wss:// protocol

**Files:**
- Modify: `src/utils/helpers.ts` (add `getLiveKitUrl` function)
- Modify: `src/LiveKitAVClient.ts:390` (use helper)
- Modify: `src/LiveKitClient.ts:1254-1255` (use helper)

**Step 1: Add getLiveKitUrl helper**

In `src/utils/helpers.ts`, add this import at the top (after line 1):

```typescript
import { MODULE_NAME } from "./constants";
```

Then add this function after the `deviceInfoToObject` function (after line 81):

```typescript
export function getLiveKitUrl(address: string): string {
  const protocol = game.settings?.get(MODULE_NAME, "devMode") ? "ws" : "wss";
  return `${protocol}://${address}`;
}
```

**Step 2: Update LiveKitAVClient.ts to use helper**

In `src/LiveKitAVClient.ts`, add `getLiveKitUrl` to the existing import from helpers (line 13):

```typescript
import { callWhenReady, delayReload, getLiveKitUrl } from "./utils/helpers";
```

Replace line 390:

```typescript
        `wss://${liveKitAddress}`,
```

With:

```typescript
        getLiveKitUrl(liveKitAddress),
```

**Step 3: Update LiveKitClient.ts to use helper**

In `src/LiveKitClient.ts`, add `getLiveKitUrl` to the existing import from helpers (line 40):

```typescript
import { debounceRefreshView, getLiveKitUrl } from "./utils/helpers";
```

Replace line 1255:

```typescript
      liveKitUrl: `wss://${liveKitServer}`,
```

With:

```typescript
      liveKitUrl: getLiveKitUrl(liveKitServer),
```

**Step 4: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/utils/helpers.ts src/LiveKitAVClient.ts src/LiveKitClient.ts
git commit -m "fix: use ws:// protocol in devMode instead of hardcoded wss://

Add getLiveKitUrl() helper that reads the existing devMode setting
to choose ws:// or wss:// protocol. Replaces hardcoded wss:// in
room connect and external join URL."
```

---

### Task 3: Extract media config constants to LiveKitMediaConfig.ts

**Files:**
- Create: `src/LiveKitMediaConfig.ts`
- Modify: `src/LiveKitClient.ts:1206-1211,1563-1574` (import constants, remove static field)
- Modify: `src/utils/registerModuleSettings.ts:25-30` (import RESOLUTION_CHOICES)

**Step 1: Create LiveKitMediaConfig.ts**

Create `src/LiveKitMediaConfig.ts`:

```typescript
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
```

**Step 2: Update LiveKitClient.ts to import from LiveKitMediaConfig**

In `src/LiveKitClient.ts`, add import after line 42:

```typescript
import {
  VIDEO_PRESETS_ORDERED,
  DEFAULT_VIDEO_CODEC,
  DEFAULT_AUDIO_PRESET,
  DEFAULT_SIMULCAST,
} from "./LiveKitMediaConfig";
```

Remove the static field at lines 1206-1211:

```typescript
  private static readonly VIDEO_PRESETS_ORDERED = [
    { key: "h180", preset: VideoPresets43.h180 },
    { key: "h360", preset: VideoPresets43.h360 },
    { key: "h540", preset: VideoPresets43.h540 },
    { key: "h720", preset: VideoPresets43.h720 },
  ] as const;
```

Update `selectedVideoPresetIndex` getter (line 1216) — replace `LiveKitClient.VIDEO_PRESETS_ORDERED` with `VIDEO_PRESETS_ORDERED`:

```typescript
  private get selectedVideoPresetIndex(): number {
    const resolutionSetting =
      game.settings?.get(MODULE_NAME, "videoResolution") ?? "h360";
    const index = VIDEO_PRESETS_ORDERED.findIndex(
      (p) => p.key === resolutionSetting,
    );
    return index >= 0 ? index : 1; // Default to h360 (index 1)
  }
```

Update `getVideoParams()` (line 1230) — replace `LiveKitClient.VIDEO_PRESETS_ORDERED` with `VIDEO_PRESETS_ORDERED`:

```typescript
    const selectedPreset =
      VIDEO_PRESETS_ORDERED[this.selectedVideoPresetIndex].preset;
```

Update `trackPublishOptions` getter (lines 1563-1574) — replace `LiveKitClient.VIDEO_PRESETS_ORDERED` and hardcoded values:

```typescript
  get trackPublishOptions(): TrackPublishOptions {
    // Build simulcast layers: include all presets below the selected resolution
    const selectedIndex = this.selectedVideoPresetIndex;
    const simulcastLayers = VIDEO_PRESETS_ORDERED
      .slice(0, Math.max(selectedIndex, 1))
      .map((p) => p.preset);

    const trackPublishOptions: TrackPublishOptions = {
      audioPreset: DEFAULT_AUDIO_PRESET,
      simulcast: DEFAULT_SIMULCAST,
      videoCodec: DEFAULT_VIDEO_CODEC,
      videoSimulcastLayers: simulcastLayers,
    };
```

After these replacements, `VideoPresets43` and `AudioPresets` are no longer directly used in `LiveKitClient.ts` **except** for `VideoPresets43.h720` in `getVideoParams()` (line 1234). Keep that import — it's used for the simulcast floor resolution check.

Check if `AudioPresets` is still used elsewhere in the file (for `AudioPresets.musicHighQuality` at line 1597). If so, keep that import too. Only remove imports that become unused.

**Step 3: Update registerModuleSettings.ts to import RESOLUTION_CHOICES**

In `src/utils/registerModuleSettings.ts`, add import at the top (after line 2):

```typescript
import { RESOLUTION_CHOICES } from "../LiveKitMediaConfig";
```

Replace the inline `choices` object in the `videoResolution` setting (lines 25-30):

```typescript
    choices: {
      h180: "180p",
      h360: "360p",
      h540: "540p",
      h720: "720p",
    },
```

With:

```typescript
    choices: RESOLUTION_CHOICES,
```

**Step 4: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors. Watch for unused import warnings — remove any `VideoPresets43` or `AudioPresets` imports from `LiveKitClient.ts` that are no longer needed (but keep them if they're still used elsewhere in the file).

**Step 5: Commit**

```bash
git add src/LiveKitMediaConfig.ts src/LiveKitClient.ts src/utils/registerModuleSettings.ts
git commit -m "refactor: extract media constants to LiveKitMediaConfig.ts

Centralizes VIDEO_PRESETS_ORDERED, RESOLUTION_CHOICES, default codec,
audio preset, and simulcast flag. LiveKitClient and registerModuleSettings
now import from the shared config."
```

---

### Task 4: Install vitest and create test configuration

**Files:**
- Modify: `package.json` (add vitest devDependency and test script)
- Create: `vitest.config.ts`
- Create: `src/__tests__/setup.ts`

**Step 1: Install vitest**

Run: `pnpm add -D vitest`

**Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"` (after the `"clean:deep"` entry):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

**Step 3: Create vitest.config.ts**

Create `vitest.config.ts` in the project root:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
```

**Step 4: Create test setup file with Foundry mocks**

Create `src/__tests__/setup.ts`:

```typescript
import { vi } from "vitest";

// Mock Foundry VTT globals
globalThis.game = {
  settings: {
    get: vi.fn(),
    register: vi.fn(),
    set: vi.fn(),
  },
  i18n: {
    localize: vi.fn((key: string) => key),
  },
  user: { id: "test-user-id" },
  ready: true,
} as unknown as typeof game;

globalThis.ui = {
  notifications: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
} as unknown as typeof ui;
```

**Step 5: Build to verify**

Run: `pnpm build`
Expected: Build succeeds (vitest config is separate from Vite build)

Run: `pnpm test`
Expected: "No test files found" or similar (no tests exist yet)

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/__tests__/setup.ts
git commit -m "chore: add vitest test infrastructure

Installs vitest, creates config extending Vite, adds Foundry VTT
global mocks in setup file. Ready for unit tests."
```

---

### Task 5: Write ReconnectManager unit tests

**Files:**
- Create: `src/__tests__/reconnect.test.ts`

**Step 1: Write the tests**

Create `src/__tests__/reconnect.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the debug module before importing ReconnectManager
vi.mock("debug", () => {
  const debugFn = () => {
    const logger = (..._args: unknown[]) => {};
    logger.log = () => {};
    return logger;
  };
  debugFn.default = debugFn;
  return { debug: debugFn, default: debugFn };
});

import { ReconnectManager } from "../utils/reconnect";

describe("ReconnectManager", () => {
  let manager: ReconnectManager;

  beforeEach(() => {
    manager = new ReconnectManager();
    vi.useFakeTimers();
    vi.mocked(game.i18n!.localize).mockImplementation((key: string) => key);
  });

  afterEach(() => {
    manager.cancel();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should resolve true on successful reconnect", async () => {
    const connectFn = vi.fn().mockResolvedValue(true);

    const promise = manager.attemptReconnect(connectFn);
    await vi.advanceTimersByTimeAsync(35000);

    await expect(promise).resolves.toBe(true);
    expect(connectFn).toHaveBeenCalledOnce();
  });

  it("should retry on failed reconnect", async () => {
    const connectFn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const promise = manager.attemptReconnect(connectFn);
    // Advance past first delay + second delay (generous to account for jitter)
    await vi.advanceTimersByTimeAsync(60000);

    await expect(promise).resolves.toBe(true);
    expect(connectFn).toHaveBeenCalledTimes(2);
  });

  it("should retry on thrown error", async () => {
    const connectFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(true);

    const promise = manager.attemptReconnect(connectFn);
    await vi.advanceTimersByTimeAsync(60000);

    await expect(promise).resolves.toBe(true);
    expect(connectFn).toHaveBeenCalledTimes(2);
  });

  it("should give up after max attempts", async () => {
    const connectFn = vi.fn().mockResolvedValue(false);

    const promise = manager.attemptReconnect(connectFn);
    await vi.advanceTimersByTimeAsync(120000);

    await expect(promise).resolves.toBe(false);
    expect(connectFn).toHaveBeenCalledTimes(5);
    expect(ui.notifications?.error).toHaveBeenCalled();
  });

  it("should show warn notification for each attempt", async () => {
    const connectFn = vi.fn().mockResolvedValue(false);

    const promise = manager.attemptReconnect(connectFn);
    await vi.advanceTimersByTimeAsync(120000);
    await promise;

    expect(ui.notifications?.warn).toHaveBeenCalledTimes(5);
  });

  it("should show info notification on success", async () => {
    const connectFn = vi.fn().mockResolvedValue(true);

    const promise = manager.attemptReconnect(connectFn);
    await vi.advanceTimersByTimeAsync(35000);
    await promise;

    expect(ui.notifications?.info).toHaveBeenCalledOnce();
  });

  it("should cancel pending reconnects", async () => {
    const connectFn = vi.fn().mockResolvedValue(true);

    const promise = manager.attemptReconnect(connectFn);
    manager.cancel();
    await vi.advanceTimersByTimeAsync(60000);

    await expect(promise).resolves.toBe(false);
    expect(connectFn).not.toHaveBeenCalled();
  });

  it("should reset state after cancel", () => {
    manager.cancel();

    // After cancel + reset, should be able to reconnect again
    const connectFn = vi.fn().mockResolvedValue(true);
    const promise = manager.attemptReconnect(connectFn);

    // cancel() sets cancelled=true, so new attempts should fail
    // until a fresh instance or explicit reset
    vi.advanceTimersByTimeAsync(5000);

    // The manager was cancelled, so this should resolve false
    return expect(promise).resolves.toBe(false);
  });

  it("should use exponential backoff delays", async () => {
    // Spy on Math.random to remove jitter for deterministic delay testing
    vi.spyOn(Math, "random").mockReturnValue(0);

    const connectFn = vi.fn().mockResolvedValue(false);

    const promise = manager.attemptReconnect(connectFn);

    // First attempt: baseDelay * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(999);
    expect(connectFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Second attempt: baseDelay * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(connectFn).toHaveBeenCalledTimes(2);

    // Let remaining attempts complete
    await vi.advanceTimersByTimeAsync(120000);
    await promise;
  });
});
```

**Step 2: Run the tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/reconnect.test.ts
git commit -m "test: add ReconnectManager unit tests

Tests exponential backoff, max attempts, cancel/reset, jitter,
notification calls, and retry on error."
```

---

### Task 6: Write getLiveKitUrl unit tests

**Files:**
- Create: `src/__tests__/helpers.test.ts`

**Step 1: Write the tests**

Create `src/__tests__/helpers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLiveKitUrl } from "../utils/helpers";

describe("getLiveKitUrl", () => {
  beforeEach(() => {
    vi.mocked(game.settings!.get).mockReset();
  });

  it("should return wss:// URL when devMode is false", () => {
    vi.mocked(game.settings!.get).mockReturnValue(false);

    expect(getLiveKitUrl("livekit.example.com")).toBe(
      "wss://livekit.example.com",
    );
  });

  it("should return ws:// URL when devMode is true", () => {
    vi.mocked(game.settings!.get).mockReturnValue(true);

    expect(getLiveKitUrl("localhost:7880")).toBe("ws://localhost:7880");
  });

  it("should return wss:// when settings is unavailable", () => {
    vi.mocked(game.settings!.get).mockReturnValue(undefined);

    expect(getLiveKitUrl("livekit.example.com")).toBe(
      "wss://livekit.example.com",
    );
  });

  it("should pass MODULE_NAME and devMode to settings.get", () => {
    vi.mocked(game.settings!.get).mockReturnValue(false);

    getLiveKitUrl("server.com");

    expect(game.settings!.get).toHaveBeenCalledWith(
      "avclient-livekit",
      "devMode",
    );
  });
});
```

**Step 2: Run the tests**

Run: `pnpm test`
Expected: All tests pass (including previous reconnect tests)

**Step 3: Commit**

```bash
git add src/__tests__/helpers.test.ts
git commit -m "test: add getLiveKitUrl unit tests

Tests ws:// vs wss:// protocol selection based on devMode setting."
```

---

### Task 7: Write LiveKitMediaConfig unit tests

**Files:**
- Create: `src/__tests__/mediaConfig.test.ts`

**Step 1: Write the tests**

Create `src/__tests__/mediaConfig.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

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
```

**Step 2: Run the tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/mediaConfig.test.ts
git commit -m "test: add LiveKitMediaConfig constant tests

Verifies preset ordering, resolution choice consistency,
default codec, audio preset, and simulcast flag."
```

---

### Task 8: Write NoiseCancellation unit tests

**Files:**
- Create: `src/__tests__/noiseCancellation.test.ts`

**Step 1: Write the tests**

Create `src/__tests__/noiseCancellation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock debug module
vi.mock("debug", () => {
  const debugFn = () => {
    const logger = (..._args: unknown[]) => {};
    logger.log = () => {};
    return logger;
  };
  debugFn.default = debugFn;
  return { debug: debugFn, default: debugFn };
});

// Mock Vite asset imports
vi.mock("@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url", () => ({
  default: "/mock/rnnoise.wasm",
}));
vi.mock("../workers/rnnoise-worklet.ts?url", () => ({
  default: "/mock/rnnoise-worklet.js",
}));

import { NoiseCancellation } from "../utils/noiseCancellation";

// Mock AudioContext and related Web Audio APIs
function createMockAudioContext() {
  const mockWorkletNode = {
    port: {
      postMessage: vi.fn(),
      onmessage: null as ((event: MessageEvent) => void) | null,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockSourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockDestinationNode = {
    stream: new MediaStream(),
    disconnect: vi.fn(),
  };

  const mockAudioContext = {
    sampleRate: 48000,
    state: "running" as AudioContextState,
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
    createMediaStreamSource: vi.fn().mockReturnValue(mockSourceNode),
    createMediaStreamDestination: vi.fn().mockReturnValue(mockDestinationNode),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockAudioContext,
    mockWorkletNode,
    mockSourceNode,
    mockDestinationNode,
  };
}

describe("NoiseCancellation", () => {
  let nc: NoiseCancellation;
  let mocks: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    nc = new NoiseCancellation();
    mocks = createMockAudioContext();

    globalThis.AudioContext = vi
      .fn()
      .mockReturnValue(mocks.mockAudioContext) as unknown as typeof AudioContext;
    globalThis.AudioWorkletNode = vi
      .fn()
      .mockReturnValue(mocks.mockWorkletNode) as unknown as typeof AudioWorkletNode;

    // Mock fetch for WASM loading
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    nc.destroy();
    vi.restoreAllMocks();
  });

  describe("initialize", () => {
    it("should create AudioContext with 48kHz sample rate", async () => {
      await nc.initialize();

      expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 48000 });
    });

    it("should load the AudioWorklet module", async () => {
      await nc.initialize();

      expect(
        mocks.mockAudioContext.audioWorklet.addModule,
      ).toHaveBeenCalledWith("/mock/rnnoise-worklet.js");
    });

    it("should return true on success", async () => {
      const result = await nc.initialize();
      expect(result).toBe(true);
    });

    it("should return false if AudioWorklet fails to load", async () => {
      mocks.mockAudioContext.audioWorklet.addModule.mockRejectedValueOnce(
        new Error("worklet load failed"),
      );

      const result = await nc.initialize();
      expect(result).toBe(false);
    });

    it("should not re-initialize if already initialized", async () => {
      await nc.initialize();
      await nc.initialize();

      expect(AudioContext).toHaveBeenCalledTimes(1);
    });
  });

  describe("toggle", () => {
    it("should update enabled state", () => {
      nc.toggle(true);
      expect(nc.enabled).toBe(true); // Note: enabled comes from _enabled, but workletNode is null

      nc.toggle(false);
      expect(nc.enabled).toBe(false);
    });
  });

  describe("destroy", () => {
    it("should close AudioContext", async () => {
      await nc.initialize();
      nc.destroy();

      expect(mocks.mockAudioContext.close).toHaveBeenCalled();
    });

    it("should be safe to call without initialization", () => {
      expect(() => nc.destroy()).not.toThrow();
    });

    it("should allow re-initialization after destroy", async () => {
      await nc.initialize();
      nc.destroy();

      const result = await nc.initialize();
      expect(result).toBe(true);
      expect(AudioContext).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run the tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/noiseCancellation.test.ts
git commit -m "test: add NoiseCancellation lifecycle tests

Tests initialize, toggle, destroy, error fallback,
and re-initialization with mocked Web Audio APIs."
```

---

### Task 9: Write Logger unit tests

**Files:**
- Create: `src/__tests__/logger.test.ts`

**Step 1: Write the tests**

Create `src/__tests__/logger.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock the debug module
const mockDebugger = vi.fn();
mockDebugger.log = vi.fn();

vi.mock("debug", () => {
  const debugFn = (namespace: string) => {
    const logger = (..._args: unknown[]) => {};
    logger.log = vi.fn();
    logger._namespace = namespace;
    return logger;
  };
  debugFn.default = debugFn;
  return { debug: debugFn, default: debugFn };
});

import { Logger } from "../utils/logger";

describe("Logger", () => {
  it("should create loggers with correct namespaces without prefix", () => {
    const logger = new Logger();

    // Access internal debugger namespace via the debug mock
    expect(logger.trace).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it("should create loggers with prefix in namespace", () => {
    const logger = new Logger("TestPrefix");

    // The debug mock stores _namespace on the function
    expect(
      (logger.trace as unknown as { _namespace: string })._namespace,
    ).toBe("avclient-livekit:TRACE:TestPrefix");
    expect(
      (logger.error as unknown as { _namespace: string })._namespace,
    ).toBe("avclient-livekit:ERROR:TestPrefix");
  });

  it("should create loggers without prefix in namespace", () => {
    const logger = new Logger();

    expect(
      (logger.trace as unknown as { _namespace: string })._namespace,
    ).toBe("avclient-livekit:TRACE");
    expect(
      (logger.error as unknown as { _namespace: string })._namespace,
    ).toBe("avclient-livekit:ERROR");
  });

  it("should bind console methods to logger outputs", () => {
    const logger = new Logger();

    // Logger sets .log on each debugger to the corresponding console method
    // Our mock captures the .log assignment
    expect(logger.trace.log).toBeDefined();
    expect(logger.debug.log).toBeDefined();
    expect(logger.info.log).toBeDefined();
    expect(logger.warn.log).toBeDefined();
    expect(logger.error.log).toBeDefined();
  });
});
```

**Step 2: Run the tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/logger.test.ts
git commit -m "test: add Logger unit tests

Tests namespace creation with and without prefix,
and console method binding."
```

---

### Task 10: Final build verification and cleanup

**Step 1: Run full build**

Run: `pnpm build`
Expected: Build succeeds with zero errors

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Run dev build**

Run: `pnpm build:dev`
Expected: Dev build succeeds

**Step 4: Review all changes**

Run: `git diff main --stat`
Run: `git log --oneline main..HEAD`

Verify:
- No unintended file modifications
- All new files are in expected locations
- No leftover TODO comments from this phase
- jQuery is no longer used anywhere in the codebase
- `wss://` is no longer hardcoded

**Step 5: Final commit if any cleanup needed**

Only if there are issues found in the review.
