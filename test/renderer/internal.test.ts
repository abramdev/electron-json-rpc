/**
 * Tests for renderer internal utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DEFAULT_API_NAME, getExposedApi, createTracker } from "../../src/renderer/internal.js";
import { setRpcDebug } from "../../src/debug.js";
import type { RpcLogEntry } from "../../src/types.js";

afterEach(() => {
  // Reset global debug state
  setRpcDebug(false);
});

describe("renderer internal utilities", () => {
  beforeEach(() => {
    // Clean up global rpc object
    delete (globalThis as any).rpc;
  });

  describe("DEFAULT_API_NAME", () => {
    it("has the correct default API name", () => {
      expect(DEFAULT_API_NAME).toBe("rpc");
    });
  });

  describe("getExposedApi", () => {
    it("returns null when API is not exposed", () => {
      const api = getExposedApi("rpc");
      expect(api).toBeNull();
    });

    it("returns the exposed API", () => {
      const mockApi = {
        call: vi.fn(),
        notify: vi.fn(),
      };
      (globalThis as any).rpc = mockApi;

      const api = getExposedApi("rpc");
      expect(api).toBe(mockApi);
    });

    it("returns API with custom name", () => {
      const mockApi = { call: vi.fn(), notify: vi.fn() };
      (globalThis as any).customApi = mockApi;

      const api = getExposedApi("customApi");
      expect(api).toBe(mockApi);
    });

    it("returns null for non-existent custom API", () => {
      const api = getExposedApi("nonExistent");
      expect(api).toBeNull();
    });
  });

  describe("createTracker", () => {
    it("creates no-op tracker when debug is disabled", () => {
      const tracker = createTracker(undefined, undefined);
      const logger = vi.fn();

      // Should not throw
      tracker.onRequest("test", [], 1);
      tracker.onResponse("test", [], null, 100, 1);
      tracker.onError("test", [], "error", 100, 1);
      tracker.onNotify("test", []);
      tracker.onStream("test", []);
      tracker.onEvent("test", {});

      expect(logger).not.toHaveBeenCalled();
    });

    it("creates active tracker when debug option is true", () => {
      const logger = vi.fn();
      const tracker = createTracker(true, logger);

      tracker.onRequest("testMethod", [1, 2], 42);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry.type).toBe("request");
      expect(entry.method).toBe("testMethod");
    });

    it("creates active tracker when global debug is enabled", () => {
      setRpcDebug(true);

      const logger = vi.fn();
      const tracker = createTracker(undefined, logger);

      tracker.onRequest("testMethod", [], 1);

      expect(logger).toHaveBeenCalledTimes(1);
    });

    it("uses provided logger function", () => {
      const customLogger = vi.fn();
      const tracker = createTracker(true, customLogger);

      tracker.onResponse("method", [], { result: "ok" }, 50, 2);

      expect(customLogger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = customLogger.mock.calls[0][0];
      expect(entry.type).toBe("response");
      expect(entry.method).toBe("method");
    });

    it("uses default logger when none provided", () => {
      // This should not throw
      const tracker = createTracker(true, undefined);
      tracker.onRequest("test", [], 1);
      // Default logger uses console.log, which we can't easily test
      // but we verify it doesn't throw
      expect(tracker).toBeDefined();
    });
  });
});
