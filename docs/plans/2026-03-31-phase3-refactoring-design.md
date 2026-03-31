# Phase 3: Refactoring & Code Quality — Design Document

**Goal:** Modernize the codebase by removing jQuery, fixing hardcoded protocols, centralizing media constants, and adding a test foundation.

**Tech Stack:** TypeScript, livekit-client v2.17.1, Vite 7, vitest, pnpm

**Build command:** `pnpm build` (runs `vite build`)

---

## 3.1: Remove jQuery Dependency

### Current State

`addConnectionQualityIndicator()` in `LiveKitClient.ts:204-213` is the only jQuery usage:

```typescript
const connectionQualityIndicator = $(
  `<div class="connection-quality-indicator unknown" title="..."></div>`,
);
$(userNameBar).after(connectionQualityIndicator);
```

### Change

Replace with vanilla DOM APIs:
- `document.createElement('div')` — set `className` and `title` attributes
- `userNameBar.insertAdjacentElement('afterend', indicator)` — insert after name bar

No new abstractions. Two lines replaced.

---

## 3.2: Fix Hardcoded `wss://` Protocol

### Current State

`wss://` is hardcoded in two locations:
1. `LiveKitAVClient.ts:390` — room connection URL
2. `LiveKitClient.ts:1255` — external client join URL

### Change

Add a helper function in `src/utils/helpers.ts`:

```typescript
export function getLiveKitUrl(address: string): string {
  const protocol = game.settings?.get(MODULE_NAME, "devMode") ? "ws" : "wss";
  return `${protocol}://${address}`;
}
```

Both call sites use `getLiveKitUrl(address)` instead of `` `wss://${address}` ``.

No new settings — the existing `devMode` setting (already registered as a dev-only setting) controls the protocol.

---

## 3.3: Extract Media Config Constants

### Scope

Constants only — getter/builder logic stays in `LiveKitClient`.

### New File: `src/LiveKitMediaConfig.ts`

Export these constants:

| Constant | Source | Type |
|----------|--------|------|
| `VIDEO_PRESETS_ORDERED` | `LiveKitClient.ts` static field | Array of `{ key, preset }` |
| `RESOLUTION_CHOICES` | `registerModuleSettings.ts` inline | `Record<string, string>` |
| `DEFAULT_VIDEO_CODEC` | `trackPublishOptions` getter hardcoded `"vp8"` | `string` |
| `DEFAULT_AUDIO_PRESET` | `trackPublishOptions` getter `AudioPresets.speech` | `AudioPreset` |
| `DEFAULT_SIMULCAST` | `trackPublishOptions` getter | `boolean` |

### Consumers

- `LiveKitClient.ts` — imports constants for `trackPublishOptions` getter and `getVideoParams()`
- `registerModuleSettings.ts` — imports `RESOLUTION_CHOICES` for the `videoResolution` setting choices

---

## 3.4: Add Unit Tests (vitest)

### Setup

- **Dependency:** `vitest` (devDependency)
- **Config:** `vitest.config.ts` extending the existing Vite config
- **Test location:** `src/__tests__/` directory
- **Mock strategy:** Mock `livekit-client` SDK and Foundry globals (`game`, `ui`, `foundry`)

### Test Targets

| Module | What to test |
|--------|-------------|
| `ReconnectManager` | Exponential backoff delays, max attempts, cancel/reset, jitter bounds |
| `NoiseCancellation` | Initialize/processStream/toggle/destroy lifecycle, error fallback |
| `getLiveKitUrl()` | Protocol selection based on devMode setting |
| `LiveKitMediaConfig` | Preset ordering, default values, constant types |
| `Logger` | Debug namespace creation |

### Not Tested (requires Foundry runtime)

- `LiveKitClient` event handlers and DOM manipulation
- `LiveKitAVClient` connection lifecycle
- `LiveKitAVConfig` settings UI
- `LiveKitBreakout` context menus

### Foundry Global Mock Pattern

```typescript
// src/__tests__/setup.ts
globalThis.game = {
  settings: { get: vi.fn(), register: vi.fn() },
  i18n: { localize: vi.fn((key) => key) },
  user: { id: "test-user-id" },
} as unknown as typeof game;

globalThis.ui = {
  notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
} as unknown as typeof ui;
```

---

## New Files

```
src/
├── LiveKitMediaConfig.ts          # Exported media constants
├── __tests__/
│   ├── setup.ts                   # Foundry global mocks
│   ├── reconnect.test.ts          # ReconnectManager tests
│   ├── noiseCancellation.test.ts  # NoiseCancellation tests
│   ├── helpers.test.ts            # getLiveKitUrl tests
│   ├── mediaConfig.test.ts        # Media constants tests
│   └── logger.test.ts             # Logger tests
vitest.config.ts                   # Test configuration
```

## Modified Files

```
src/
├── LiveKitClient.ts               # Remove jQuery, import media constants,
│                                   # remove VIDEO_PRESETS_ORDERED static field
├── LiveKitAVClient.ts             # Use getLiveKitUrl() helper
├── utils/
│   ├── helpers.ts                 # Add getLiveKitUrl()
│   └── registerModuleSettings.ts  # Import RESOLUTION_CHOICES
package.json                       # Add vitest devDependency
```

## Dependencies

- **Add (dev):** `vitest`
