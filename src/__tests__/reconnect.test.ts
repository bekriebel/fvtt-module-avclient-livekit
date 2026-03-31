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
    vi.clearAllMocks();
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

    void manager.attemptReconnect(connectFn);
    manager.cancel();

    // After cancel, the timer is cleared so the promise will never resolve
    // on its own. Advance time to confirm connectFn is never called.
    await vi.advanceTimersByTimeAsync(60000);
    // Verify the connect function was never invoked.
    expect(connectFn).not.toHaveBeenCalled();
  });

  it("should use exponential backoff delays", async () => {
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
