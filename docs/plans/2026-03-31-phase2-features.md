# Phase 2: New Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add video resolution/bitrate control, RNNoise noise cancellation, reconnect with exponential backoff, and per-user client-side mute/hide to the avclient-livekit module.

**Architecture:** Four independent features integrated into the existing LiveKitClient/LiveKitBreakout architecture. New settings in `registerModuleSettings.ts`, two new utility files (`reconnect.ts`, `noiseCancellation.ts`), one AudioWorklet processor. No test framework exists in this project — validation is done via `pnpm build` (TypeScript + ESLint strict via vite-plugin-checker).

**Tech Stack:** TypeScript, livekit-client v2.17.1, @jitsi/rnnoise-wasm, Vite, pnpm

**Build command:** `pnpm build` (runs `vite build`)

---

### Task 1: Register video resolution and bitrate settings

**Files:**
- Modify: `src/utils/registerModuleSettings.ts` (add 3 settings before `audioMusicMode`)
- Modify: `types/avclient-livekit.d.ts` (add type declarations)
- Modify: `public/lang/en.json` (add localization strings)

**Step 1: Add localization strings**

In `public/lang/en.json`, add these entries before the closing `}`:

```json
  "LIVEKITAVCLIENT.videoResolution": "Video Resolution",
  "LIVEKITAVCLIENT.videoResolutionHint": "Maximum video resolution to capture. Higher resolution uses more bandwidth and CPU. With simulcast enabled, lower-quality layers are sent automatically for viewers with limited bandwidth.",
  "LIVEKITAVCLIENT.videoBitrate": "Video Bitrate (kbps)",
  "LIVEKITAVCLIENT.videoBitrateHint": "Maximum video bitrate in kilobits per second. Set to 0 for automatic (recommended). Higher values improve quality but use more bandwidth.",
  "LIVEKITAVCLIENT.audioBitrate": "Audio Bitrate (kbps)",
  "LIVEKITAVCLIENT.audioBitrateHint": "Audio bitrate in kilobits per second. Set to 0 to use the default speech preset. Higher values improve quality but use more bandwidth."
```

**Step 2: Register the 3 new settings**

In `src/utils/registerModuleSettings.ts`, add these registrations after the `displayConnectionQuality` setting (after line 16) and before `liveKitConnectionSettings`:

```typescript
  game.settings?.register(MODULE_NAME, "videoResolution", {
    name: "LIVEKITAVCLIENT.videoResolution",
    hint: "LIVEKITAVCLIENT.videoResolutionHint",
    scope: "client",
    config: true,
    default: "h360",
    type: new foundry.data.fields.StringField({ initial: "h360" }),
    choices: {
      h180: "180p",
      h360: "360p",
      h540: "540p",
      h720: "720p",
    },
    onChange: () => {
      game.webrtc?.client._liveKitClient
        .changeVideoSource()
        .catch((error: unknown) => {
          log.error("videoResolution: Error changing video source", error);
        });
    },
  });

  game.settings?.register(MODULE_NAME, "videoBitrate", {
    name: "LIVEKITAVCLIENT.videoBitrate",
    hint: "LIVEKITAVCLIENT.videoBitrateHint",
    scope: "client",
    config: true,
    default: 0,
    type: new foundry.data.fields.NumberField({ initial: 0, min: 0, max: 2500, step: 100 }),
    onChange: () => {
      game.webrtc?.client._liveKitClient
        .changeVideoSource()
        .catch((error: unknown) => {
          log.error("videoBitrate: Error changing video source", error);
        });
    },
  });

  game.settings?.register(MODULE_NAME, "audioBitrate", {
    name: "LIVEKITAVCLIENT.audioBitrate",
    hint: "LIVEKITAVCLIENT.audioBitrateHint",
    scope: "client",
    config: true,
    default: 0,
    type: new foundry.data.fields.NumberField({ initial: 0, min: 0, max: 128, step: 8 }),
    onChange: () => {
      game.webrtc?.client._liveKitClient
        .changeAudioSource(true)
        .catch((error: unknown) => {
          log.error("audioBitrate: Error changing audio source", error);
        });
    },
  });
```

**Step 3: Add type declarations**

In `types/avclient-livekit.d.ts`, add inside the `SettingConfig` interface (after the `displayConnectionQuality` entry):

```typescript
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
```

**Step 4: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/utils/registerModuleSettings.ts types/avclient-livekit.d.ts public/lang/en.json
git commit -m "feat: add video resolution, video bitrate, and audio bitrate settings

Three new client-scoped settings for controlling media quality.
onChange callbacks trigger source restart for immediate effect."
```

---

### Task 2: Wire settings into getVideoParams and trackPublishOptions

**Files:**
- Modify: `src/LiveKitClient.ts:1090-1111` (`getVideoParams`)
- Modify: `src/LiveKitClient.ts:1424-1437` (`trackPublishOptions` getter)

**Step 1: Update `getVideoParams()` to use videoResolution setting**

Replace lines 1090-1111 of `src/LiveKitClient.ts`:

```typescript
  getVideoParams(): VideoCaptureOptions | false {
    // Configure whether the user can send video
    const videoSrc = this.settings.get("client", "videoSrc");
    const canBroadcastVideo = this.avMaster.canUserBroadcastVideo(
      game.user?.id ?? "",
    );

    if (
      typeof videoSrc !== "string" ||
      videoSrc !== "disabled" ||
      !canBroadcastVideo
    ) {
      // Intentional: fall through to return false below
    }

    const resolutionSetting =
      (game.settings?.get(MODULE_NAME, "videoResolution") as string) ?? "h360";
    const resolutionMap: Record<
      string,
      (typeof VideoPresets43)[keyof typeof VideoPresets43]
    > = {
      h180: VideoPresets43.h180,
      h360: VideoPresets43.h360,
      h540: VideoPresets43.h540,
      h720: VideoPresets43.h720,
    };

    const selectedPreset = resolutionMap[resolutionSetting] ?? VideoPresets43.h360;

    // With simulcast, capture at the selected resolution (or 720p minimum
    // to have enough quality for higher layers)
    let videoResolution = selectedPreset.resolution;
    if (this.trackPublishOptions.simulcast) {
      // Capture at least 720p when simulcast is on so higher layers are available
      const h720 = VideoPresets43.h720.resolution;
      if (
        selectedPreset.resolution.width < h720.width ||
        selectedPreset.resolution.height < h720.height
      ) {
        videoResolution = h720;
      }
    }

    return typeof videoSrc === "string" &&
      videoSrc !== "disabled" &&
      canBroadcastVideo
      ? {
          deviceId: { ideal: videoSrc },
          resolution: videoResolution,
        }
      : false;
  }
```

**Step 2: Update `trackPublishOptions` getter to use bitrate settings**

Replace lines 1424-1437 of `src/LiveKitClient.ts`:

```typescript
  get trackPublishOptions(): TrackPublishOptions {
    const resolutionSetting =
      (game.settings?.get(MODULE_NAME, "videoResolution") as string) ?? "h360";

    // Build simulcast layers: include all presets below the selected resolution
    const orderedPresets = [
      { key: "h180", preset: VideoPresets43.h180 },
      { key: "h360", preset: VideoPresets43.h360 },
      { key: "h540", preset: VideoPresets43.h540 },
      { key: "h720", preset: VideoPresets43.h720 },
    ];
    const selectedIndex = orderedPresets.findIndex(
      (p) => p.key === resolutionSetting,
    );
    const simulcastLayers = orderedPresets
      .slice(0, Math.max(selectedIndex, 1))
      .map((p) => p.preset);

    const trackPublishOptions: TrackPublishOptions = {
      audioPreset: AudioPresets.speech,
      simulcast: true,
      videoCodec: "vp8",
      videoSimulcastLayers: simulcastLayers,
    };

    // Apply custom video bitrate
    const videoBitrate =
      (game.settings?.get(MODULE_NAME, "videoBitrate") as number) ?? 0;
    if (videoBitrate > 0) {
      trackPublishOptions.videoEncoding = {
        maxBitrate: videoBitrate * 1000,
      };
    }

    // Apply custom audio bitrate
    const audioBitrate =
      (game.settings?.get(MODULE_NAME, "audioBitrate") as number) ?? 0;
    if (audioBitrate > 0) {
      trackPublishOptions.audioPreset = undefined;
      trackPublishOptions.audioEncoding = {
        maxBitrate: audioBitrate * 1000,
      };
    }

    // Music mode overrides audio preset
    if (game.settings?.get(MODULE_NAME, "audioMusicMode")) {
      trackPublishOptions.audioPreset = AudioPresets.musicHighQuality;
      trackPublishOptions.audioEncoding = undefined;
    }

    return trackPublishOptions;
  }
```

**Step 3: Add `AudioEncoding` import if needed**

Check the livekit-client imports at the top of `src/LiveKitClient.ts`. The `videoEncoding` and `audioEncoding` fields use inline object literals matching the `VideoEncoding`/`AudioEncoding` interfaces, so no additional imports should be needed. If the build shows a type error, add the imports.

**Step 4: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "feat: wire video resolution and bitrate settings into track options

getVideoParams now reads videoResolution setting. trackPublishOptions
reads videoBitrate and audioBitrate for custom encoding configuration.
Simulcast layers auto-adjust based on selected resolution."
```

---

### Task 3: Create ReconnectManager utility

**Files:**
- Create: `src/utils/reconnect.ts`

**Step 1: Write the ReconnectManager class**

Create `src/utils/reconnect.ts`:

```typescript
import { Logger } from "./logger";
import { LANG_NAME } from "./constants";

const log = new Logger("ReconnectManager");

export class ReconnectManager {
  private attempts = 0;
  private readonly maxAttempts = 5;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;

  async attemptReconnect(
    connectFn: () => Promise<boolean>,
  ): Promise<boolean> {
    if (this.cancelled) {
      return false;
    }

    if (this.attempts >= this.maxAttempts) {
      log.error("Max reconnect attempts reached");
      ui.notifications?.error(
        game.i18n?.localize(`${LANG_NAME}.reconnectFailed`) ??
          "Reconnection failed after maximum attempts",
      );
      this.reset();
      return false;
    }

    const jitter = Math.random() * 1000;
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts) + jitter,
      this.maxDelay,
    );

    this.attempts++;
    log.info(
      `Reconnect attempt ${this.attempts}/${this.maxAttempts} in ${Math.round(delay)}ms`,
    );

    ui.notifications?.warn(
      `${game.i18n?.localize(`${LANG_NAME}.reconnecting`) ?? "Reconnecting"}... (${this.attempts}/${this.maxAttempts})`,
    );

    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        if (this.cancelled) {
          resolve(false);
          return;
        }

        connectFn()
          .then((success) => {
            if (success) {
              this.reset();
              ui.notifications?.info(
                game.i18n?.localize(`${LANG_NAME}.reconnected`) ??
                  "Reconnected successfully",
              );
              resolve(true);
            } else {
              this.attemptReconnect(connectFn)
                .then(resolve)
                .catch(() => resolve(false));
            }
          })
          .catch(() => {
            this.attemptReconnect(connectFn)
              .then(resolve)
              .catch(() => resolve(false));
          });
      }, delay);
    });
  }

  reset(): void {
    this.attempts = 0;
    this.cancelled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.reset();
  }
}
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds (file is not imported yet, but should compile standalone)

**Step 3: Commit**

```bash
git add src/utils/reconnect.ts
git commit -m "feat: add ReconnectManager with exponential backoff

Handles full disconnects where LiveKit SDK gives up. Retries up to
5 times with exponential backoff (1s, 2s, 4s, 8s, 16s + jitter,
capped at 30s). Shows notifications for each attempt."
```

---

### Task 4: Integrate ReconnectManager into LiveKitClient

**Files:**
- Modify: `src/LiveKitClient.ts` (import, class field, onDisconnected, onReconnected)
- Modify: `public/lang/en.json` (add reconnect strings)

**Step 1: Add localization strings**

In `public/lang/en.json`, add:

```json
  "LIVEKITAVCLIENT.reconnecting": "Reconnecting to A/V server",
  "LIVEKITAVCLIENT.reconnected": "Reconnected to A/V server",
  "LIVEKITAVCLIENT.reconnectFailed": "Failed to reconnect to A/V server after maximum attempts"
```

**Step 2: Add import and class field**

In `src/LiveKitClient.ts`, add import after the existing imports (after line 41):

```typescript
import { ReconnectManager } from "./utils/reconnect";
```

Add class field after `private _boundOnVolumeChange` (after line 67):

```typescript
  private reconnectManager = new ReconnectManager();
```

**Step 3: Update `onDisconnected` to trigger reconnect**

Replace the `onDisconnected` method (lines 728-746):

```typescript
  onDisconnected(reason?: DisconnectReason): void {
    log.debug("Client disconnected", { reason });
    let disconnectWarning =
      game.i18n?.localize(`${LANG_NAME}.onDisconnected`) ?? "onDisconnected";
    if (reason) {
      disconnectWarning += `: ${DisconnectReason[reason]}`;
    }
    ui.notifications?.warn(disconnectWarning);

    // Clear the participant map
    this.liveKitParticipants.clear();

    // Set connection buttons state
    this.setConnectionButtons(false);

    this.connectionState = ConnectionState.Disconnected;

    // Attempt reconnect unless it was intentional
    if (reason !== DisconnectReason.CLIENT_INITIATED) {
      this.reconnectManager
        .attemptReconnect(() => this.avMaster.connect())
        .catch((error) => {
          log.error("Reconnect failed:", error);
        });
    } else {
      // Cancel any pending reconnect if disconnect was intentional
      this.reconnectManager.cancel();
    }
  }
```

**Step 4: Update `onReconnected` to reset reconnect manager**

Replace the `onReconnected` method (lines 847-851):

```typescript
  onReconnected(): void {
    log.info("Reconnect issued");
    this.reconnectManager.reset();
    // Re-render just in case users changed
    this.render();
  }
```

**Step 5: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add src/LiveKitClient.ts public/lang/en.json
git commit -m "feat: integrate reconnect manager into disconnect handler

On non-intentional disconnect, starts exponential backoff reconnect.
Intentional disconnect cancels any pending reconnect attempts.
Reconnect manager resets when SDK reconnect succeeds."
```

---

### Task 5: Install @jitsi/rnnoise-wasm dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `pnpm add @jitsi/rnnoise-wasm`

**Step 2: Verify installation**

Run: `ls node_modules/@jitsi/rnnoise-wasm/dist/`
Expected: Should contain `rnnoise.js`, `rnnoise-sync.js`, or similar files.

Check what the package exports:

Run: `cat node_modules/@jitsi/rnnoise-wasm/package.json | head -30`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add @jitsi/rnnoise-wasm dependency

RNNoise noise suppression library compiled to WASM, will be used
for client-side noise cancellation via AudioWorklet."
```

---

### Task 6: Create AudioWorklet processor for RNNoise

**Files:**
- Create: `src/workers/rnnoise-worklet.ts`

**Important context:** AudioWorklet processors run in a separate thread and cannot use standard ES module imports. The `@jitsi/rnnoise-wasm` package provides a `rnnoise-sync.js` variant that inlines WASM as base64 and compiles synchronously — this is required for AudioWorklet contexts.

**Step 1: Investigate the @jitsi/rnnoise-wasm API**

Before writing the worklet, read the package to understand the API:

Run: `cat node_modules/@jitsi/rnnoise-wasm/README.md 2>/dev/null || echo "No README"`
Run: `ls -la node_modules/@jitsi/rnnoise-wasm/dist/ 2>/dev/null || ls -la node_modules/@jitsi/rnnoise-wasm/`
Run: `head -50 node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js 2>/dev/null || head -50 node_modules/@jitsi/rnnoise-wasm/dist/rnnoise.js 2>/dev/null`

**Step 2: Write the AudioWorklet processor**

Based on the API investigation, create `src/workers/rnnoise-worklet.ts`. The general pattern is:

```typescript
// This file runs in an AudioWorklet context.
// It uses RNNoise to suppress background noise from audio frames.
// RNNoise operates on 480-sample frames at 48kHz (~10ms per frame).

// The WASM module will be loaded synchronously from the main thread
// and passed to this worklet via the processor options or port message.

const RNNOISE_SAMPLE_LENGTH = 480;

class RNNoiseProcessor extends AudioWorkletProcessor {
  private enabled = true;
  private rnnoiseState: unknown = null;
  private rnnoiseModule: unknown = null;
  private inputBuffer: Float32Array = new Float32Array(0);
  private inputBufferOffset = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();

    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; enabled?: boolean };
      if (data.type === "toggle") {
        this.enabled = data.enabled ?? true;
      }
    };

    // Initialize RNNoise - the actual initialization depends on the
    // package API discovered in Step 1
    this.initRNNoise(options?.processorOptions).catch(() => {
      // If init fails, processor will pass through audio unchanged
    });
  }

  private async initRNNoise(
    processorOptions?: Record<string, unknown>,
  ): Promise<void> {
    // Implementation depends on @jitsi/rnnoise-wasm API
    // Will be finalized after Step 1 investigation
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input || !output) {
      return true;
    }

    if (!this.enabled || !this.rnnoiseState) {
      // Pass through unchanged
      output.set(input);
      return true;
    }

    // Buffer input samples until we have RNNOISE_SAMPLE_LENGTH (480)
    // AudioWorklet provides 128 samples per process() call
    // We need to accumulate 480 samples before processing
    // Copy processed output back

    // This is a simplified version; actual implementation needs
    // proper ring buffer management
    output.set(input);
    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
```

**Note:** The exact implementation depends on what Step 1 reveals about the `@jitsi/rnnoise-wasm` API. The implementing agent should adapt this skeleton based on the actual API.

**Step 3: Build to verify**

The worklet file may need special Vite configuration to build as a separate worker entry point. Check if Vite handles it via `new URL('...', import.meta.url)` pattern or if it needs a separate build config.

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/workers/rnnoise-worklet.ts
git commit -m "feat: add RNNoise AudioWorklet processor

Processes audio through RNNoise WASM for noise suppression.
Operates on 480-sample frames at 48kHz with ~13ms latency.
Can be toggled on/off via port messages."
```

---

### Task 7: Create NoiseCancellation manager

**Files:**
- Create: `src/utils/noiseCancellation.ts`

**Step 1: Write the NoiseCancellation class**

Create `src/utils/noiseCancellation.ts`:

```typescript
import { Logger } from "./logger";

const log = new Logger("NoiseCancellation");

export class NoiseCancellation {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private initialized = false;
  private _enabled = false;

  get enabled(): boolean {
    return this._enabled;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Load the AudioWorklet module
      const workletUrl = new URL(
        "../workers/rnnoise-worklet.ts",
        import.meta.url,
      ).href;
      await this.audioContext.audioWorklet.addModule(workletUrl);

      this.initialized = true;
      log.info("RNNoise noise cancellation initialized");
      return true;
    } catch (error) {
      log.warn("Failed to initialize noise cancellation:", error);
      this.initialized = false;
      return false;
    }
  }

  async processStream(inputStream: MediaStream): Promise<MediaStream> {
    if (!this.initialized || !this.audioContext) {
      log.warn(
        "Noise cancellation not initialized, returning original stream",
      );
      return inputStream;
    }

    // Clean up previous nodes
    this.cleanupNodes();

    try {
      // Resume audio context if suspended
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Create audio processing pipeline
      this.sourceNode =
        this.audioContext.createMediaStreamSource(inputStream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "rnnoise-processor",
      );
      this.destinationNode =
        this.audioContext.createMediaStreamDestination();

      // Connect: input -> RNNoise -> output
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.destinationNode);

      this._enabled = true;
      this.workletNode.port.postMessage({ type: "toggle", enabled: true });

      log.info("Noise cancellation active");
      return this.destinationNode.stream;
    } catch (error) {
      log.error("Failed to set up noise cancellation pipeline:", error);
      this.cleanupNodes();
      return inputStream;
    }
  }

  toggle(enable: boolean): void {
    this._enabled = enable;
    this.workletNode?.port.postMessage({ type: "toggle", enabled: enable });
    log.info("Noise cancellation", enable ? "enabled" : "disabled");
  }

  private cleanupNodes(): void {
    try {
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
    } catch {
      // Nodes may already be disconnected
    }
    this.sourceNode = null;
    this.workletNode = null;
    this.destinationNode = null;
    this._enabled = false;
  }

  destroy(): void {
    this.cleanupNodes();
    this.audioContext
      ?.close()
      .catch((error) =>
        log.warn("Error closing audio context:", error),
      );
    this.audioContext = null;
    this.initialized = false;
  }
}
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds. Note: the worklet URL pattern `new URL('...', import.meta.url)` is how Vite handles worker/worklet files — it should work out of the box.

**Step 3: Commit**

```bash
git add src/utils/noiseCancellation.ts
git commit -m "feat: add NoiseCancellation manager class

Manages AudioWorklet lifecycle for RNNoise integration.
Creates audio pipeline: MediaStream -> RNNoise worklet -> output.
Supports enable/disable toggle and graceful cleanup."
```

---

### Task 8: Register noise cancellation setting and integrate into LiveKitClient

**Files:**
- Modify: `src/utils/registerModuleSettings.ts` (add `enableNoiseCancellation` setting)
- Modify: `types/avclient-livekit.d.ts` (add type declaration)
- Modify: `src/LiveKitClient.ts` (import NoiseCancellation, add field, wire into audio init)
- Modify: `public/lang/en.json` (add localization string)

**Step 1: Add localization string**

In `public/lang/en.json`, add:

```json
  "LIVEKITAVCLIENT.enableNoiseCancellation": "Enable Noise Cancellation",
  "LIVEKITAVCLIENT.enableNoiseCancellationHint": "Uses RNNoise to suppress background noise before sending audio. Adds ~13ms latency. Automatically disabled when Audio Music Mode is active."
```

**Step 2: Register the setting**

In `src/utils/registerModuleSettings.ts`, add after the `audioBitrate` setting (before `audioMusicMode`):

```typescript
  game.settings?.register(MODULE_NAME, "enableNoiseCancellation", {
    name: "LIVEKITAVCLIENT.enableNoiseCancellation",
    hint: "LIVEKITAVCLIENT.enableNoiseCancellationHint",
    scope: "client",
    config: true,
    default: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
    onChange: () => {
      game.webrtc?.client._liveKitClient
        .changeAudioSource(true)
        .catch((error: unknown) => {
          log.error(
            "enableNoiseCancellation: Error changing audio source",
            error,
          );
        });
    },
  });
```

**Step 3: Add type declaration**

In `types/avclient-livekit.d.ts`, add inside `SettingConfig`:

```typescript
    "avclient-livekit.enableNoiseCancellation": foundry.data.fields.BooleanField<{
      initial: true;
    }>;
```

**Step 4: Add NoiseCancellation to LiveKitClient**

In `src/LiveKitClient.ts`, add import:

```typescript
import { NoiseCancellation } from "./utils/noiseCancellation";
```

Add class field after `reconnectManager`:

```typescript
  private noiseCancellation = new NoiseCancellation();
```

**Step 5: Integrate into `initializeAudioTrack`**

In the `initializeAudioTrack` method (lines 569-599), after the audio track is created successfully (after line 579 `this.audioTrack = await createLocalAudioTrack(audioParams);`), add noise cancellation processing. Replace the try block:

```typescript
    if (audioParams) {
      try {
        this.audioTrack = await createLocalAudioTrack(audioParams);

        // Apply noise cancellation if enabled and not in music mode
        const ncEnabled =
          game.settings?.get(MODULE_NAME, "enableNoiseCancellation") ?? true;
        const musicMode =
          game.settings?.get(MODULE_NAME, "audioMusicMode") ?? false;

        if (ncEnabled && !musicMode && this.audioTrack) {
          const initialized = await this.noiseCancellation.initialize();
          if (initialized) {
            const processedStream =
              await this.noiseCancellation.processStream(
                this.audioTrack.mediaStream!,
              );
            const processedTrack = processedStream.getAudioTracks()[0];
            if (processedTrack) {
              await this.audioTrack.setMediaStreamTrack(processedTrack);
            }
          }
        } else {
          this.noiseCancellation.toggle(false);
        }
      } catch (error: unknown) {
        let message = error;
        if (error instanceof Error) {
          message = error.message;
        }
        log.error("Unable to acquire local audio:", message);
      }
    }
```

**Step 6: Build to verify**

Run: `pnpm build`
Expected: Build succeeds. If `setMediaStreamTrack` doesn't exist on `LocalAudioTrack`, check the livekit-client API — the method may be `replaceTrack()` or require accessing the underlying `MediaStreamTrack` differently.

**Step 7: Commit**

```bash
git add src/utils/registerModuleSettings.ts types/avclient-livekit.d.ts src/LiveKitClient.ts public/lang/en.json
git commit -m "feat: integrate noise cancellation into audio pipeline

Adds enableNoiseCancellation setting (default: true). After creating
the local audio track, routes audio through RNNoise AudioWorklet.
Automatically disabled when audioMusicMode is active."
```

---

### Task 9: Add per-user mute/hide state to LiveKitClient

**Files:**
- Modify: `src/LiveKitClient.ts` (add Sets, helper methods, modify `onTrackSubscribed`)

**Step 1: Add locally muted/hidden Sets as class fields**

In `src/LiveKitClient.ts`, add after the `noiseCancellation` field:

```typescript
  locallyMutedUsers = new Set<string>();
  locallyHiddenUsers = new Set<string>();
```

**Step 2: Add methods to toggle local mute/hide**

Add these methods to the `LiveKitClient` class (before `onVolumeChange`):

```typescript
  toggleLocalMute(userId: string): void {
    if (this.locallyMutedUsers.has(userId)) {
      this.locallyMutedUsers.delete(userId);
      this.setRemoteTrackEnabled(userId, Track.Kind.Audio, true);
      log.info("Locally unmuted user:", userId);
    } else {
      this.locallyMutedUsers.add(userId);
      this.setRemoteTrackEnabled(userId, Track.Kind.Audio, false);
      log.info("Locally muted user:", userId);
    }
  }

  toggleLocalHide(userId: string): void {
    if (this.locallyHiddenUsers.has(userId)) {
      this.locallyHiddenUsers.delete(userId);
      this.setRemoteTrackEnabled(userId, Track.Kind.Video, true);
      log.info("Locally unhidden user:", userId);
    } else {
      this.locallyHiddenUsers.add(userId);
      this.setRemoteTrackEnabled(userId, Track.Kind.Video, false);
      log.info("Locally hidden user:", userId);
    }
  }

  private setRemoteTrackEnabled(
    userId: string,
    kind: Track.Kind,
    enabled: boolean,
  ): void {
    const participant = this.liveKitParticipants.get(userId);
    if (!participant || !(participant instanceof RemoteParticipant)) {
      return;
    }

    const publications =
      kind === Track.Kind.Audio
        ? participant.audioTrackPublications
        : participant.videoTrackPublications;

    for (const publication of publications.values()) {
      if (publication instanceof RemoteTrackPublication) {
        publication.setEnabled(enabled);
      }
    }
  }
```

**Step 3: Apply mute/hide state on track subscription**

In the `onTrackSubscribed` method (lines 986-1039), add a check after the track is attached. Add this before the final `debounceRefreshView(fvttUserId);` call (before line 1038):

```typescript
    // Apply local mute/hide state for this user
    if (
      track instanceof RemoteAudioTrack &&
      this.locallyMutedUsers.has(fvttUserId)
    ) {
      if (publication instanceof RemoteTrackPublication) {
        publication.setEnabled(false);
      }
    } else if (
      track instanceof RemoteVideoTrack &&
      this.locallyHiddenUsers.has(fvttUserId)
    ) {
      if (publication instanceof RemoteTrackPublication) {
        publication.setEnabled(false);
      }
    }
```

**Step 4: Re-apply state on reconnect**

In the `onReconnected` method, add re-application of mute/hide state after the render call:

```typescript
  onReconnected(): void {
    log.info("Reconnect issued");
    this.reconnectManager.reset();

    // Re-apply local mute/hide state for all tracked users
    for (const userId of this.locallyMutedUsers) {
      this.setRemoteTrackEnabled(userId, Track.Kind.Audio, false);
    }
    for (const userId of this.locallyHiddenUsers) {
      this.setRemoteTrackEnabled(userId, Track.Kind.Video, false);
    }

    // Re-render just in case users changed
    this.render();
  }
```

**Step 5: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "feat: add per-user local mute/hide state management

Tracks locally muted/hidden users in Sets. Disables remote track
publications for muted/hidden users. Re-applies state on track
subscription and reconnection. In-memory only, resets on reload."
```

---

### Task 10: Add context menu items for local mute/hide

**Files:**
- Modify: `src/LiveKitBreakout.ts` (add context menu entries)
- Modify: `public/lang/en.json` (add localization strings)

**Step 1: Add localization strings**

In `public/lang/en.json`, add:

```json
  "LIVEKITAVCLIENT.muteUserLocal": "Mute user (local)",
  "LIVEKITAVCLIENT.unmuteUserLocal": "Unmute user (local)",
  "LIVEKITAVCLIENT.hideUserLocal": "Hide video (local)",
  "LIVEKITAVCLIENT.showUserLocal": "Show video (local)"
```

**Step 2: Add context menu items**

In `src/LiveKitBreakout.ts`, in the `addContextOptions` function, add these entries after the existing breakout entries (before the closing `);` of `contextOptions.push`):

```typescript
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.muteUserLocal`) ??
        "Mute user (local)",
      icon: '<i class="fas fa-microphone-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          !liveKitClient.locallyMutedUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalMute(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.unmuteUserLocal`) ??
        "Unmute user (local)",
      icon: '<i class="fas fa-microphone"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          liveKitClient.locallyMutedUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalMute(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.hideUserLocal`) ??
        "Hide video (local)",
      icon: '<i class="fas fa-video-slash"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          !liveKitClient.locallyHiddenUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalHide(userId);
        }
      },
    },
    {
      name:
        game.i18n?.localize(`${LANG_NAME}.showUserLocal`) ??
        "Show video (local)",
      icon: '<i class="fas fa-video"></i>',
      condition: (players) => {
        const userId: string = players.dataset.userId ?? "";
        return (
          userId !== game.user?.id &&
          liveKitClient.locallyHiddenUsers.has(userId)
        );
      },
      callback: (players) => {
        const userId: string = players.dataset.userId ?? "";
        if (userId) {
          liveKitClient.toggleLocalHide(userId);
        }
      },
    },
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/LiveKitBreakout.ts public/lang/en.json
git commit -m "feat: add context menu items for local mute/hide

Right-click a player to mute their audio or hide their video locally.
Labels toggle between mute/unmute and hide/show based on current state.
Only visible for other users, not self."
```

---

### Task 11: Final build verification and cleanup

**Step 1: Run full build**

Run: `pnpm build`
Expected: Build succeeds with zero errors

**Step 2: Run dev build**

Run: `pnpm build:dev`
Expected: Dev build succeeds

**Step 3: Review all changes**

Run: `git diff main --stat`
Run: `git log --oneline main..HEAD`

Verify:
- No unintended file modifications
- All new files are in expected locations
- All localization strings added
- All type declarations added
- No leftover TODO comments from this phase

**Step 4: Final commit if any cleanup needed**

Only if there are issues found in the review.

---

## Post-implementation notes

### Known areas requiring runtime testing

1. **AudioWorklet + Vite:** The `new URL('../workers/rnnoise-worklet.ts', import.meta.url)` pattern should work with Vite, but needs testing in a real Foundry VTT environment to confirm the worklet loads correctly.

2. **`setMediaStreamTrack`:** The livekit-client `LocalAudioTrack` API for replacing the underlying MediaStreamTrack may use a different method name. Check the API during implementation.

3. **`RemoteTrackPublication.setEnabled()`:** Verify this is the correct API for locally disabling a remote track subscription. Alternative: `setSubscribed(false)` may be needed instead.

4. **Foundry `NumberField` in settings:** The `choices` option works with `StringField` for selects. For `NumberField` settings (videoBitrate, audioBitrate), the UI may render as a plain number input rather than a dropdown. If a dropdown is desired, consider using `StringField` with string values and parsing to number on read.

5. **`@jitsi/rnnoise-wasm` API:** The worklet implementation (Task 6) is a skeleton that must be adapted based on the actual package API. The implementing agent should read the package source before writing the final worklet.
