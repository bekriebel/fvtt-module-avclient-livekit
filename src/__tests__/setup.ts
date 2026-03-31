import { vi } from "vitest";

// Mock Foundry VTT globals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

g.game = {
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
};

g.ui = {
  notifications: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
};
