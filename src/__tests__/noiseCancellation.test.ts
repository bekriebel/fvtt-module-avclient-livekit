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

    globalThis.MediaStream = class MediaStream {} as unknown as typeof globalThis.MediaStream;

    mocks = createMockAudioContext();

    globalThis.AudioContext = vi
      .fn()
      .mockImplementation(function () {
        return mocks.mockAudioContext;
      }) as unknown as typeof AudioContext;
    globalThis.AudioWorkletNode = vi
      .fn()
      .mockImplementation(function () {
        return mocks.mockWorkletNode;
      }) as unknown as typeof AudioWorkletNode;

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
      expect(nc.enabled).toBe(true);
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
