/**
 * Tests for renderer event bus utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/renderer/event.js";

// Mock window.rpc
const mockEventHandlers = new Map<string, Set<(data?: unknown) => void>>();

const mockApi = {
  call: vi.fn(),
  notify: vi.fn(),
  stream: vi.fn(),
  on: vi.fn((eventName: string, callback: (data?: unknown) => void) => {
    if (!mockEventHandlers.has(eventName)) {
      mockEventHandlers.set(eventName, new Set());
    }
    mockEventHandlers.get(eventName)!.add(callback);
    return () => {
      mockApi.off(eventName, callback);
    };
  }),
  off: vi.fn((eventName: string, callback?: (data?: unknown) => void) => {
    if (callback) {
      const handlers = mockEventHandlers.get(eventName);
      if (handlers) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          mockEventHandlers.delete(eventName);
        }
      }
    } else {
      mockEventHandlers.delete(eventName);
    }
  }),
  once: vi.fn((eventName: string, callback: (data?: unknown) => void) => {
    if (!mockEventHandlers.has(eventName)) {
      mockEventHandlers.set(eventName, new Set());
    }
    const wrapped = (data?: unknown) => {
      callback(data);
      // Auto-remove after first call
      const handlers = mockEventHandlers.get(eventName);
      if (handlers) {
        handlers.delete(wrapped);
        if (handlers.size === 0) {
          mockEventHandlers.delete(eventName);
        }
      }
    };
    mockEventHandlers.get(eventName)!.add(wrapped);
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEventHandlers.clear();
  (globalThis as any).rpc = mockApi;
});

describe("createEventBus", () => {
  it("throws error when API is not exposed", () => {
    delete (globalThis as any).rpc;

    expect(() => createEventBus()).toThrow("RPC API not found");
  });

  it("throws error when API does not have event methods", () => {
    (globalThis as any).rpc = { call: vi.fn() };

    expect(() => createEventBus()).toThrow("Event bus methods not available");
  });

  it("creates event bus with on, off, once, and getSubscribedEvents methods", () => {
    const bus = createEventBus();

    expect(bus).toHaveProperty("on");
    expect(bus).toHaveProperty("off");
    expect(bus).toHaveProperty("once");
    expect(bus).toHaveProperty("getSubscribedEvents");
    expect(typeof bus.on).toBe("function");
    expect(typeof bus.off).toBe("function");
    expect(typeof bus.once).toBe("function");
    expect(typeof bus.getSubscribedEvents).toBe("function");
  });

  describe("on", () => {
    it("subscribes to an event", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      const unsubscribe = bus.on("test-event", handler);

      expect(typeof unsubscribe).toBe("function");
      expect(mockApi.on).toHaveBeenCalledWith("test-event", expect.any(Function));
    });

    it("returns unsubscribe function", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      const unsubscribe = bus.on("test-event", handler);
      unsubscribe();

      expect(mockApi.on).toHaveBeenCalled();
      expect(mockApi.off).toHaveBeenCalled();
    });

    it("tracks subscribed events", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.on("event1", handler);

      expect(bus.getSubscribedEvents()).toEqual(["event1"]);
    });

    it("handles multiple subscriptions", () => {
      const bus = createEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on("event1", handler1);
      bus.on("event2", handler2);

      expect(bus.getSubscribedEvents()).toEqual(expect.arrayContaining(["event1", "event2"]));
    });
  });

  describe("off", () => {
    it("unsubscribes specific callback", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.on("test-event", handler);
      bus.off("test-event", handler);

      expect(mockApi.off).toHaveBeenCalled();
      expect(bus.getSubscribedEvents()).not.toContain("test-event");
    });

    it("unsubscribes all callbacks when none specified", () => {
      const bus = createEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on("test-event", handler1);
      bus.on("test-event", handler2);
      bus.off("test-event");

      expect(bus.getSubscribedEvents()).not.toContain("test-event");
    });

    it("handles unsubscribing from non-existent event gracefully", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      expect(() => bus.off("non-existent", handler)).not.toThrow();
    });
  });

  describe("once", () => {
    it("subscribes for single event", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.once("test-event", handler);

      expect(mockApi.once).toHaveBeenCalledWith("test-event", expect.any(Function));
    });

    it("tracks subscribed events", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.once("test-event", handler);

      expect(bus.getSubscribedEvents()).toContain("test-event");
    });

    it("unsubscribes after first call", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.once("test-event", handler);

      // Trigger the handler
      const handlers = mockEventHandlers.get("test-event");
      if (handlers) {
        for (const h of handlers) {
          h("test data");
        }
      }

      // After being called, should be removed
      expect(bus.getSubscribedEvents()).not.toContain("test-event");
    });
  });

  describe("getSubscribedEvents", () => {
    it("returns empty array initially", () => {
      const bus = createEventBus();
      expect(bus.getSubscribedEvents()).toEqual([]);
    });

    it("returns list of subscribed events", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.on("event1", handler);
      bus.on("event2", handler);
      bus.on("event3", handler);

      const events = bus.getSubscribedEvents();
      expect(events).toHaveLength(3);
      expect(events).toEqual(expect.arrayContaining(["event1", "event2", "event3"]));
    });

    it("updates after unsubscribe", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      const unsub1 = bus.on("event1", handler);
      bus.on("event2", handler);

      unsub1();

      expect(bus.getSubscribedEvents()).toEqual(["event2"]);
    });
  });

  describe("typed event bus", () => {
    interface TestEvents {
      "user-updated": { id: string; name: string };
      "user-deleted": { id: string };
      ping: void;
    }

    it("provides type safety for events", () => {
      const bus = createEventBus<TestEvents>();
      const handler = vi.fn();

      bus.on("user-updated", handler);
      bus.on("user-deleted", handler);
      bus.on("ping", handler);

      expect(bus.getSubscribedEvents()).toHaveLength(3);
    });

    it("allows any events by default", () => {
      const bus = createEventBus();
      const handler = vi.fn();

      bus.on("any-event", handler);

      expect(bus.getSubscribedEvents()).toContain("any-event");
    });
  });

  describe("debug tracking", () => {
    it("tracks events when debug is enabled", () => {
      const logger = vi.fn();
      const bus = createEventBus({ debug: true, logger });
      const handler = vi.fn();

      bus.on("test-event", handler);

      // Trigger the handler
      const handlers = mockEventHandlers.get("test-event");
      if (handlers) {
        for (const h of handlers) {
          h({ data: "test" });
        }
      }

      expect(logger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event",
          method: "test-event",
        }),
      );
    });

    it("does not track when debug is disabled", () => {
      const logger = vi.fn();
      const bus = createEventBus({ debug: false, logger });
      const handler = vi.fn();

      bus.on("test-event", handler);

      // Trigger the handler
      const handlers = mockEventHandlers.get("test-event");
      if (handlers) {
        for (const h of handlers) {
          h({ data: "test" });
        }
      }

      expect(logger).not.toHaveBeenCalled();
    });
  });

  describe("custom API name", () => {
    it("uses custom API name", () => {
      const customApi = {
        call: vi.fn(),
        notify: vi.fn(),
        stream: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
      };
      (globalThis as any).customRpc = customApi;

      const bus = createEventBus({ apiName: "customRpc" });

      expect(bus).toBeDefined();

      delete (globalThis as any).customRpc;
    });
  });
});
