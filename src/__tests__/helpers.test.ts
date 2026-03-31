import { describe, it, expect, vi, beforeEach } from "vitest";

// These globals must be set before helpers.ts is imported because it
// uses foundry.utils.debounce and Hooks.once at module scope.
// vi.hoisted runs before any vi.mock calls and module imports.
vi.hoisted(() => {
  (globalThis as any).foundry = {
    utils: {
      debounce: (fn: Function, _delay: number) => fn,
    },
  };
  (globalThis as any).Hooks = {
    once: () => {},
  };
});

// Mock debug module (helpers.ts imports Logger which imports debug)
vi.mock("debug", () => {
  const debugFn = () => {
    const logger = (..._args: unknown[]) => {};
    logger.log = () => {};
    return logger;
  };
  debugFn.default = debugFn;
  return { debug: debugFn, default: debugFn };
});

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
