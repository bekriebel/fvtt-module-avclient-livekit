import { describe, it, expect, vi } from "vitest";

// Mock the debug module
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
  it("should create all five log levels", () => {
    const logger = new Logger();
    expect(logger.trace).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it("should create loggers with prefix in namespace", () => {
    const logger = new Logger("TestPrefix");
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
    expect(logger.trace.log).toBeDefined();
    expect(logger.debug.log).toBeDefined();
    expect(logger.info.log).toBeDefined();
    expect(logger.warn.log).toBeDefined();
    expect(logger.error.log).toBeDefined();
  });
});
