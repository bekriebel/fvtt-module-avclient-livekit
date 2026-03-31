# Phase 2: New Features — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four new features to the avclient-livekit module: video resolution/bitrate control, RNNoise noise cancellation, reconnect with exponential backoff, and per-user client-side mute/hide.

**Tech Stack:** TypeScript, livekit-client v2.17.1, @jitsi/rnnoise-wasm, Vite, pnpm

**Build command:** `pnpm build` (runs `vite build`)

---

## Feature 2.1: Video Resolution & Bitrate Control

### New Settings (client scope, no reload required)

| Setting | Type | Default | Options |
|---------|------|---------|---------|
| `videoResolution` | String (select) | `"h360"` | h180, h360, h540, h720 |
| `videoBitrate` | Number | `0` (auto) | 0, 200, 500, 1000, 1500, 2500 kbps |
| `audioBitrate` | Number | `0` (speech preset) | 0, 32, 64, 128 kbps |

### Changes

- **`registerModuleSettings.ts`**: Register 3 new settings with select/number fields. onChange callbacks trigger `changeAudioSource(true)` / `changeVideoSource()`.
- **`getVideoParams()`** (`LiveKitClient.ts:1090`): Read `videoResolution` setting to pick preset from `VideoPresets43` instead of hardcoding h180/h720.
- **`trackPublishOptions` getter** (`LiveKitClient.ts:1424`): Read `videoBitrate` setting; if > 0, set `videoEncoding.maxBitrate`. Read `audioBitrate`; if > 0, override `audioPreset` with custom encoding.
- **Simulcast layers**: Auto-adjust — always include layers below the selected resolution.

---

## Feature 2.2: Noise Cancellation with RNNoise/WASM

### Architecture

- **Package:** `@jitsi/rnnoise-wasm` — sync WASM loading mode for AudioWorklet context.
- **New file:** `src/utils/noiseCancellation.ts` — manages AudioWorklet lifecycle, creates AudioContext pipeline.
- **New file:** `src/workers/rnnoise-worklet.ts` — AudioWorkletProcessor running RNNoise (480-frame buffer, ~13ms latency).

### Integration

After `createLocalAudioTrack()`, intercept the MediaStreamTrack:
1. Route through AudioContext -> AudioWorkletNode (RNNoise) -> MediaStreamDestination
2. Replace the track on the LocalAudioTrack via `setMediaStreamTrack()`

### Settings

| Setting | Type | Default |
|---------|------|---------|
| `enableNoiseCancellation` | Boolean | `true` |

### Behavior

- When enabled: audio routed through RNNoise before LiveKit.
- When disabled: raw audio sent; browser native `noiseSuppression` used as fallback.
- `audioMusicMode` override: if music mode on, noise cancellation forced off.
- Toggle takes effect on next `changeAudioSource()` — no reload needed.

### Edge Cases

- AudioWorklet unsupported: fall back to native `noiseSuppression: true`.
- WASM load failure: log warning, continue without noise cancellation.

---

## Feature 2.3: Reconnect with Exponential Backoff

### Architecture

- **New file:** `src/utils/reconnect.ts` — `ReconnectManager` class.

### Scope

LiveKit SDK handles transient reconnects (brief blips via `Reconnecting`/`Reconnected` events). This feature handles **full disconnects** where the SDK gives up — the `onDisconnected` TODO at `LiveKitClient.ts:745`.

### Parameters

| Parameter | Value |
|-----------|-------|
| Max attempts | 5 |
| Base delay | 1s |
| Max delay | 30s |
| Jitter | random 0-1s per attempt |
| Formula | `min(baseDelay * 2^attempt + jitter, maxDelay)` |

Resulting delays: ~1s, ~2s, ~4s, ~8s, ~16s (plus jitter, capped at 30s).

### UI Feedback

- Each attempt: warn notification "Reconnecting... (attempt N/5)"
- Success: info notification "Reconnected successfully"
- Final failure: error notification "Reconnection failed after 5 attempts"

### Integration

- `LiveKitClient` gets a `reconnectManager` class field.
- `onDisconnected()` calls `reconnectManager.attemptReconnect(() => this.avMaster.connect())` unless `CLIENT_INITIATED`.
- `onReconnected()` and intentional disconnect call `reconnectManager.reset()`.
- `reconnectManager.cancel()` on intentional disconnect to prevent competing attempts.

---

## Feature 2.4: Per-User Mute/Hide (Client-Side Only)

### Approach

Purely local — disable/enable remote track publications. No socket events, no notification to the muted user.

### Context Menu Items

Added to `addContextOptions()` in `LiveKitBreakout.ts`:

| Menu Item | Icon | Condition |
|-----------|------|-----------|
| "Mute user (local)" / "Unmute user (local)" | `fa-microphone-slash` / `fa-microphone` | Not self, has audio |
| "Hide video (local)" / "Show video (local)" | `fa-video-slash` / `fa-video` | Not self, has video |

### State

- `LiveKitClient` gets `locallyMutedUsers: Set<string>` and `locallyHiddenUsers: Set<string>` (keyed by FVTT userId).
- In-memory only — resets on page reload (intentional).

### Implementation

- **Mute:** `RemoteTrackPublication.setEnabled(false)` on audio tracks.
- **Unmute:** `RemoteTrackPublication.setEnabled(true)`.
- **Hide/Show:** Same pattern with video track publications.

### Re-apply on Reconnect

After `onReconnected()` and in `onTrackSubscribed()`, check sets and disable tracks for locally muted/hidden users.

### Menu Labels

Toggle label text based on whether userId is in the corresponding Set.

---

## New Files Summary

```
src/
├── utils/
│   ├── noiseCancellation.ts    # AudioWorklet manager for RNNoise
│   └── reconnect.ts            # ReconnectManager with exponential backoff
└── workers/
    └── rnnoise-worklet.ts      # AudioWorkletProcessor for RNNoise
```

## Modified Files Summary

```
src/
├── LiveKitBreakout.ts          # Add per-user mute/hide context menu items
├── LiveKitClient.ts            # Bitrate/resolution in getVideoParams/trackPublishOptions,
│                               # reconnect integration, noise cancellation integration,
│                               # locally muted/hidden user sets + re-apply logic
└── utils/
    ├── registerModuleSettings.ts  # 4 new settings (videoResolution, videoBitrate,
    │                              #   audioBitrate, enableNoiseCancellation)
    └── hooks.ts                   # (if needed for AudioWorklet registration)
```

## Dependencies

- **Add:** `@jitsi/rnnoise-wasm` (production dependency)
