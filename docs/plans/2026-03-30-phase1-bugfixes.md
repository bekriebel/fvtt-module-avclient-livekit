# Phase 1: Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and non-critical bugs in the avclient-livekit module without changing architecture.

**Architecture:** Direct surgical fixes to existing code — safe JSON parsing, proper error handling, event listener cleanup, debounce correction. No new files, no new dependencies.

**Tech Stack:** TypeScript, livekit-client v2.17.1, Vite, pnpm

**Build command:** `pnpm build` (runs `vite build`)

**Lint/type-check:** Built into the build via `vite-plugin-checker` (TypeScript + ESLint strict)

---

### Task 1: Fix invalid JSON fallback in `getParticipantUseExternalAV`

**Files:**
- Modify: `src/LiveKitClient.ts:424-431`

**Step 1: Fix the invalid JSON fallback and add try/catch**

Replace lines 424-431 in `src/LiveKitClient.ts`:

```typescript
// BEFORE (broken):
getParticipantUseExternalAV(participant: Participant): boolean {
  const { useExternalAV } = JSON.parse(
    participant.metadata ?? "{ false }",
  ) as {
    useExternalAV: boolean;
  };
  return useExternalAV;
}

// AFTER (fixed):
getParticipantUseExternalAV(participant: Participant): boolean {
  try {
    const { useExternalAV } = JSON.parse(
      participant.metadata ?? "{}",
    ) as {
      useExternalAV?: boolean;
    };
    return useExternalAV ?? false;
  } catch (error) {
    log.warn("Failed to parse participant metadata for useExternalAV:", error);
    return false;
  }
}
```

Key changes:
- `"{ false }"` (invalid JSON) -> `"{}"` (valid empty object)
- Added `try/catch` for malformed metadata from other clients
- `useExternalAV` type changed to optional (`?`) with `?? false` fallback
- Return type stays `boolean`

**Step 2: Build to verify no type errors**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "fix: invalid JSON fallback in getParticipantUseExternalAV

'{ false }' is not valid JSON - replaced with '{}' and added
try/catch to handle malformed metadata from other clients."
```

---

### Task 2: Add try/catch to `getParticipantFVTTUser`

**Files:**
- Modify: `src/LiveKitClient.ts:417-422`

**Step 1: Wrap JSON.parse in try/catch**

Replace lines 417-422 in `src/LiveKitClient.ts`:

```typescript
// BEFORE:
getParticipantFVTTUser(participant: Participant): User | undefined {
  const { fvttUserId } = JSON.parse(participant.metadata ?? "{}") as {
    fvttUserId: string;
  };
  return game.users?.get(fvttUserId);
}

// AFTER:
getParticipantFVTTUser(participant: Participant): User | undefined {
  try {
    const { fvttUserId } = JSON.parse(participant.metadata ?? "{}") as {
      fvttUserId?: string;
    };
    return fvttUserId ? game.users?.get(fvttUserId) : undefined;
  } catch (error) {
    log.warn("Failed to parse participant metadata for FVTT user lookup:", error);
    return undefined;
  }
}
```

Key changes:
- Added `try/catch` — a malformed metadata payload from any participant would crash the module for ALL connected users
- `fvttUserId` typed as optional with explicit check before `.get()`

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "fix: add try/catch to getParticipantFVTTUser JSON parsing

Malformed metadata from any participant could crash the module
for all connected users."
```

---

### Task 3: Handle screen share cancellation

**Files:**
- Modify: `src/LiveKitClient.ts:1300-1315`

**Step 1: Wrap `createLocalScreenTracks` in try/catch**

In `src/LiveKitClient.ts`, in the `shareScreen` method (line ~1300), wrap the `createLocalScreenTracks` call:

```typescript
// BEFORE (lines 1312-1315):
    // Get screen tracks
    this.screenTracks = await createLocalScreenTracks({
      audio: screenAudioOptions,
    });

// AFTER:
    // Get screen tracks
    try {
      this.screenTracks = await createLocalScreenTracks({
        audio: screenAudioOptions,
      });
    } catch (error) {
      log.warn("Screen share cancelled or failed:", error);
      return;
    }
```

Key change: When user clicks "Cancel" in OS screen picker dialog, `createLocalScreenTracks()` throws. Without this catch, the entire module crashes.

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "fix: handle screen share dialog cancellation gracefully

createLocalScreenTracks throws when user cancels the OS screen
picker, causing a module crash."
```

---

### Task 4: Fix `debounceRefreshView` losing userId on rapid calls

**Files:**
- Modify: `src/utils/helpers.ts:34-39`

**Step 1: Replace single-debounce with batch pattern**

Replace lines 34-39 in `src/utils/helpers.ts`:

```typescript
// BEFORE:
export const debounceRefreshView: (userId: string) => void =
  foundry.utils.debounce((userId: string) => {
    ui.webrtc?.render({ parts: [userId] }).catch((error: unknown) => {
      log.error("Error refreshing user view:", error);
    });
  }, 200);

// AFTER:
const pendingRefreshUsers = new Set<string>();
const _executeRefresh = foundry.utils.debounce(() => {
  const users = [...pendingRefreshUsers];
  pendingRefreshUsers.clear();
  for (const userId of users) {
    ui.webrtc?.render({ parts: [userId] }).catch((error: unknown) => {
      log.error("Error refreshing user view:", error);
    });
  }
}, 200);

export function debounceRefreshView(userId: string): void {
  pendingRefreshUsers.add(userId);
  _executeRefresh();
}
```

**Why this matters:** `foundry.utils.debounce` wraps the *entire* function call including arguments. If two users connect within 200ms, only the last `userId` gets refreshed. The batch pattern collects all pending userIds and processes them all when the debounce fires.

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds. The export signature `(userId: string) => void` is unchanged, so all callers remain compatible.

**Step 3: Commit**

```bash
git add src/utils/helpers.ts
git commit -m "fix: debounceRefreshView now batches multiple userIds

Previous implementation lost userId arguments when called rapidly
for different users within the 200ms debounce window."
```

---

### Task 5: Fix volume slider memory leak from `.bind(this)`

**Files:**
- Modify: `src/LiveKitClient.ts:66` (add class field)
- Modify: `src/LiveKitClient.ts:541` (use stored reference)

**Step 1: Add bound reference as class field**

In `src/LiveKitClient.ts`, add a new class field after line 66 (`windowClickListener`):

```typescript
// Add after line 66:
private _boundOnVolumeChange = this.onVolumeChange.bind(this);
```

**Step 2: Use stored reference in `getUserAudioElement`**

Replace line 541:

```typescript
// BEFORE (line 541):
      volumeSlider?.addEventListener("change", this.onVolumeChange.bind(this));

// AFTER:
      volumeSlider?.removeEventListener("change", this._boundOnVolumeChange);
      volumeSlider?.addEventListener("change", this._boundOnVolumeChange);
```

**Why:** `.bind(this)` creates a new function reference each call, so `removeEventListener` can never match. On reconnects, listeners accumulate. The `removeEventListener` before `addEventListener` is defensive — it's a no-op on first call but prevents doubling on reconnects.

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "fix: prevent volume slider event listener memory leak

.bind(this) creates a new reference each time, preventing
removeEventListener from working. Store bound reference once."
```

---

### Task 6: Fix typos in log messages

**Files:**
- Modify: `src/LiveKitAVClient.ts:787` — `"chaning"` -> `"changing"`
- Modify: `src/LiveKitAVClient.ts:823` — `"redering"` -> `"rendering"`
- Modify: `src/LiveKitClient.ts:201` — `"Connectin"` -> `"Connection"`
- Modify: `src/utils/auth.ts:66` — comment `"12 hours"` -> `"10 hours"`

**Step 1: Fix all four typos**

In `src/LiveKitAVClient.ts` line 787:
```typescript
// BEFORE:
log.error("Error chaning audio source:", error);
// AFTER:
log.error("Error changing audio source:", error);
```

In `src/LiveKitAVClient.ts` line 823:
```typescript
// BEFORE:
log.error("Error redering settings sheet:", error);
// AFTER:
log.error("Error rendering settings sheet:", error);
```

In `src/LiveKitClient.ts` line 201:
```typescript
// BEFORE:
) ?? "Connectin Quality Unknown"
// AFTER:
) ?? "Connection Quality Unknown"
```

In `src/utils/auth.ts` line 66:
```typescript
// BEFORE:
    .setExpirationTime("10h") // Expire after 12 hours
// AFTER:
    .setExpirationTime("10h") // Expire after 10 hours
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/LiveKitAVClient.ts src/LiveKitClient.ts src/utils/auth.ts
git commit -m "fix: correct typos in log messages and comments"
```

---

### Task 7: Clear breakout room registry in `_endAllBreakouts`

**Files:**
- Modify: `src/LiveKitBreakout.ts:226-241`

**Step 1: Add registry clearing to `_endAllBreakouts`**

Replace the `_endAllBreakouts` function (lines 226-241) in `src/LiveKitBreakout.ts`:

```typescript
// BEFORE:
function _endAllBreakouts(liveKitClient: LiveKitClient): void {
  if (!game.user?.isGM) {
    log.warn("Only a GM can end all breakout conference rooms");
    return;
  }

  game.socket.emit(`module.${MODULE_NAME}`, {
    action: "breakout",
    userId: undefined,
    breakoutRoom: undefined,
  });

  if (liveKitClient.breakoutRoom) {
    breakout(undefined, liveKitClient);
  }
}

// AFTER:
function _endAllBreakouts(liveKitClient: LiveKitClient): void {
  if (!game.user?.isGM) {
    log.warn("Only a GM can end all breakout conference rooms");
    return;
  }

  // Clear the breakout room registry
  // Note: breakoutRoomRegistry has scope "client", so this only clears the GM's local copy.
  // The socket broadcast below tells other clients to leave their breakout rooms,
  // which will trigger their own cleanup via the breakout() function.
  game.settings?.set(MODULE_NAME, "breakoutRoomRegistry", {}).catch((error) => {
    log.error("Error clearing breakout room registry:", error);
  });

  game.socket.emit(`module.${MODULE_NAME}`, {
    action: "breakout",
    userId: undefined,
    breakoutRoom: undefined,
  });

  if (liveKitClient.breakoutRoom) {
    breakout(undefined, liveKitClient);
  }
}
```

**Design note:** The `breakoutRoomRegistry` setting has `scope: "client"` (per-browser), so the GM can only clear their own registry. Other clients receive the socket broadcast and call `breakout(undefined, ...)`, which triggers `game.webrtc?.connect()` — reconnecting to the main room. The registry entries on other clients become stale but harmless since they're only read for context menu conditions. A full fix would require changing the scope to `"world"`, but that's a larger change better suited for Phase 3.

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/LiveKitBreakout.ts
git commit -m "fix: clear breakout room registry when ending all breakouts

_endAllBreakouts sent socket events but never cleared the GM's
local breakoutRoomRegistry, leaving stale entries after reload."
```

---

### Task 8: Add event listener cleanup for Room and Participant callbacks

**Files:**
- Modify: `src/LiveKitClient.ts:1250-1297` (`setRoomCallbacks`)
- Modify: `src/LiveKitClient.ts:1228-1248` (`setRemoteParticipantCallbacks`)
- Modify: `src/LiveKitClient.ts:1208-1226` (`setLocalParticipantCallbacks`)

**Step 1: Add targeted listener removal before re-adding in `setRoomCallbacks`**

In `src/LiveKitClient.ts`, at the beginning of `setRoomCallbacks()` (after the null check, before setting callbacks), add removal of specific events:

```typescript
setRoomCallbacks(): void {
  if (!this.liveKitRoom) {
    log.warn(
      "Attempted to set up room callbacks before the LiveKit room is ready",
    );
    return;
  }

  // Remove existing event listeners to prevent duplication on reconnect.
  // IMPORTANT: Do NOT use removeAllListeners() — that would also remove
  // LiveKit SDK's internal listeners and break the room.
  this.liveKitRoom.off(RoomEvent.AudioPlaybackStatusChanged);
  this.liveKitRoom.off(RoomEvent.ParticipantConnected);
  this.liveKitRoom.off(RoomEvent.ParticipantDisconnected);
  this.liveKitRoom.off(RoomEvent.TrackSubscribed);
  this.liveKitRoom.off(RoomEvent.TrackSubscriptionFailed);
  this.liveKitRoom.off(RoomEvent.TrackUnpublished);
  this.liveKitRoom.off(RoomEvent.TrackUnsubscribed);
  this.liveKitRoom.off(RoomEvent.LocalTrackUnpublished);
  this.liveKitRoom.off(RoomEvent.ConnectionQualityChanged);
  this.liveKitRoom.off(RoomEvent.Disconnected);
  this.liveKitRoom.off(RoomEvent.Reconnecting);
  this.liveKitRoom.off(RoomEvent.TrackMuted);
  this.liveKitRoom.off(RoomEvent.TrackUnmuted);
  this.liveKitRoom.off(RoomEvent.ParticipantMetadataChanged);
  this.liveKitRoom.off(RoomEvent.RoomMetadataChanged);
  this.liveKitRoom.off(RoomEvent.Reconnected);

  // Set up event callbacks
  this.liveKitRoom
    .on(
      // ... rest unchanged
```

**Step 2: Add removal in `setRemoteParticipantCallbacks`**

Add removal before re-adding in `setRemoteParticipantCallbacks`:

```typescript
setRemoteParticipantCallbacks(participant: RemoteParticipant): void {
  const fvttUserId = this.getParticipantFVTTUser(participant)?.id;

  if (!fvttUserId) {
    log.warn(
      "Participant",
      participant,
      "is not an FVTT user; skipping setRemoteParticipantCallbacks",
    );
    return;
  }

  // Remove existing listeners to prevent duplication
  participant.off(ParticipantEvent.IsSpeakingChanged);
  participant.off(ParticipantEvent.ParticipantMetadataChanged);

  participant
    .on(
      ParticipantEvent.IsSpeakingChanged,
      this.onIsSpeakingChanged.bind(this, fvttUserId),
    )
    .on(ParticipantEvent.ParticipantMetadataChanged, (...args) => {
      log.debug("Remote ParticipantEvent ParticipantMetadataChanged:", args);
    });
}
```

**Step 3: Add removal in `setLocalParticipantCallbacks`**

Add removal before re-adding in `setLocalParticipantCallbacks`:

```typescript
setLocalParticipantCallbacks(): void {
  // Remove existing listeners to prevent duplication
  this.liveKitRoom?.localParticipant.off(ParticipantEvent.IsSpeakingChanged);
  this.liveKitRoom?.localParticipant.off(ParticipantEvent.ParticipantMetadataChanged);
  this.liveKitRoom?.localParticipant.off(ParticipantEvent.TrackPublished);
  this.liveKitRoom?.localParticipant.off(ParticipantEvent.TrackSubscriptionStatusChanged);

  this.liveKitRoom?.localParticipant
    .on(
      // ... rest unchanged
```

**Why NOT `removeAllListeners()`:** LiveKit SDK's `Room` and `Participant` classes use EventEmitter internally. `removeAllListeners()` would remove the SDK's own internal handlers (e.g., for track management, signaling), breaking the connection. We must only remove the specific events we registered.

**Step 4: Build to verify**

Run: `pnpm build`
Expected: Build succeeds. Note: the `.off(event)` signature (without callback) removes ALL listeners for that event. Verify this is the correct signature for livekit-client's EventEmitter. If the SDK requires a specific callback reference, we'll need to store bound references (similar to Task 5).

**Step 5: Commit**

```bash
git add src/LiveKitClient.ts
git commit -m "fix: remove stale event listeners before re-registering

On reconnect, setRoomCallbacks/setParticipantCallbacks were called
again without removing previous listeners, causing handler duplication."
```

---

## Post-implementation checklist

After all 8 tasks are done:

1. Run `pnpm build` — must succeed with zero errors
2. Run `pnpm build:dev` — verify dev build works too
3. Review all changes with `git diff main` to ensure no unintended modifications
4. Verify the `.off(event)` API works as expected with livekit-client's EventEmitter — if it doesn't support removing all listeners for an event without a callback, Task 8 needs adjustment to store bound references

---

## Known limitations (deferred to later phases)

- **breakoutRoomRegistry scope:** The `scope: "client"` means each browser stores its own copy. Ending all breakouts clears only the GM's registry. Other clients' registries become stale but harmless. Full fix requires `scope: "world"` migration (Phase 3).
- **LiveKit SDK built-in reconnect:** The SDK already handles transient connection drops via `RoomEvent.Reconnecting`/`Reconnected`. The TODO at line 733 for custom reconnect logic is only needed for full disconnects where the SDK gives up. This is Phase 2 (Task 2.3).
