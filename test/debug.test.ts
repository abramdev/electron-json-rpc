/**
 * Tests for debug utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setRpcDebug,
  isRpcDebug,
  setRpcLogger,
  getLogger,
  isDebugEnabled,
  formatTimestamp,
  createDebugTracker,
  type DebugTracker,
} from "../src/debug.js";
import type { RpcLogEntry } from "../src/types.js";

describe("debug utilities", () => {
  beforeEach(() => {
    // Reset global debug state
    setRpcDebug(false);
    setRpcLogger(null);
    vi.clearAllMocks();
  });

  describe("setRpcDebug / isRpcDebug", () => {
    it("starts with debug disabled", () => {
      expect(isRpcDebug()).toBe(false);
    });

    it("enables debug when set to true", () => {
      setRpcDebug(true);
      expect(isRpcDebug()).toBe(true);
    });

    it("disables debug when set to false", () => {
      setRpcDebug(true);
      setRpcDebug(false);
      expect(isRpcDebug()).toBe(false);
    });
  });

  describe("setRpcLogger / getLogger", () => {
    it("returns default logger when no custom logger is set", () => {
      const logger = getLogger();
      expect(typeof logger).toBe("function");
    });

    it("sets custom logger", () => {
      const customLogger = vi.fn();
      setRpcLogger(customLogger);
      const logger = getLogger();
      expect(logger).toBe(customLogger);
    });

    it("resets to default logger when set to null", () => {
      const customLogger = vi.fn();
      setRpcLogger(customLogger);
      setRpcLogger(null);
      const logger = getLogger();
      expect(logger).not.toBe(customLogger);
      expect(typeof logger).toBe("function");
    });
  });

  describe("isDebugEnabled", () => {
    it("returns false by default", () => {
      expect(isDebugEnabled()).toBe(false);
    });

    it("returns true when global debug is enabled", () => {
      setRpcDebug(true);
      expect(isDebugEnabled()).toBe(true);
    });

    it("returns true when debug option is true", () => {
      expect(isDebugEnabled(true)).toBe(true);
    });

    it("returns true when either global or option is true", () => {
      setRpcDebug(true);
      expect(isDebugEnabled(false)).toBe(true);
      expect(isDebugEnabled(true)).toBe(true);
    });
  });

  describe("formatTimestamp", () => {
    it("formats timestamp as time string", () => {
      const timestamp = new Date("2024-01-15T14:30:45.123Z").getTime();
      const formatted = formatTimestamp(timestamp);
      // Format should be HH:MM:SS.mmm
      expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it("produces consistent format", () => {
      const timestamp = Date.now();
      const formatted1 = formatTimestamp(timestamp);
      const formatted2 = formatTimestamp(timestamp);
      expect(formatted1).toBe(formatted2);
    });
  });

  describe("createDebugTracker", () => {
    it("returns no-op tracker when disabled", () => {
      const tracker = createDebugTracker(false, vi.fn());
      expect(tracker).toBeDefined();
      // Should not throw when calling methods
      tracker.onRequest("test", [], 1);
      tracker.onResponse("test", [], null, 100, 1);
      tracker.onError("test", [], "error", 100, 1);
      tracker.onNotify("test", []);
      tracker.onStream("test", []);
      tracker.onEvent("test", {});
    });

    it("returns active tracker when enabled", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      expect(tracker).toBeDefined();
      expect(logger).not.toHaveBeenCalled();
    });

    it("calls logger on request", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onRequest("testMethod", [1, 2, 3], 42);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "request",
        method: "testMethod",
        params: [1, 2, 3],
        requestId: 42,
      });
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it("calls logger on response", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onResponse("testMethod", [1], { result: "ok" }, 150, 5);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "response",
        method: "testMethod",
        params: [1],
        result: { result: "ok" },
        duration: 150,
        requestId: 5,
      });
    });

    it("calls logger on error", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onError("testMethod", [], "Something went wrong", 200, 7);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "error",
        method: "testMethod",
        params: [],
        error: "Something went wrong",
        duration: 200,
        requestId: 7,
      });
    });

    it("calls logger on notify", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onNotify("notifyMethod", [{ data: "test" }]);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "notify",
        method: "notifyMethod",
        params: [{ data: "test" }],
      });
    });

    it("calls logger on stream", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onStream("streamMethod", [10]);

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "stream",
        method: "streamMethod",
        params: [10],
      });
    });

    it("calls logger on event", () => {
      const logger = vi.fn();
      const tracker = createDebugTracker(true, logger);

      tracker.onEvent("user-updated", { id: 1, name: "John" });

      expect(logger).toHaveBeenCalledTimes(1);
      const entry: RpcLogEntry = logger.mock.calls[0][0];
      expect(entry).toMatchObject({
        type: "event",
        method: "user-updated",
        params: [{ id: 1, name: "John" }],
      });
    });
  });

  describe("DebugTracker interface", () => {
    it("has all required methods", () => {
      const tracker: DebugTracker = {
        onRequest: vi.fn(),
        onResponse: vi.fn(),
        onError: vi.fn(),
        onNotify: vi.fn(),
        onStream: vi.fn(),
        onEvent: vi.fn(),
      };
      expect(tracker.onRequest).toBeDefined();
      expect(tracker.onResponse).toBeDefined();
      expect(tracker.onError).toBeDefined();
      expect(tracker.onNotify).toBeDefined();
      expect(tracker.onStream).toBeDefined();
      expect(tracker.onEvent).toBeDefined();
    });
  });
});
