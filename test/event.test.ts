/**
 * Tests for event utilities
 */

import { describe, it, expect } from "vitest";
import {
  EVENT_CHANNEL,
  createSubscribeMessage,
  createUnsubscribeMessage,
  createEventMessage,
  isEventMessage,
  isSubscribeMessage,
  isUnsubscribeMessage,
} from "../src/event.js";

describe("event utilities", () => {
  describe("EVENT_CHANNEL constant", () => {
    it("has the correct channel name", () => {
      expect(EVENT_CHANNEL).toBe("json-rpc-events");
    });
  });

  describe("createSubscribeMessage", () => {
    it("creates a subscribe message", () => {
      const message = createSubscribeMessage("user-updated");
      expect(message).toEqual({
        type: "subscribe",
        eventName: "user-updated",
      });
    });

    it("creates subscribe messages for different events", () => {
      const msg1 = createSubscribeMessage("event1");
      const msg2 = createSubscribeMessage("event2");
      expect(msg1.eventName).toBe("event1");
      expect(msg2.eventName).toBe("event2");
    });
  });

  describe("createUnsubscribeMessage", () => {
    it("creates an unsubscribe message", () => {
      const message = createUnsubscribeMessage("user-updated");
      expect(message).toEqual({
        type: "unsubscribe",
        eventName: "user-updated",
      });
    });
  });

  describe("createEventMessage", () => {
    it("creates an event message with data", () => {
      const message = createEventMessage("user-updated", { id: 1, name: "John" });
      expect(message).toEqual({
        type: "event",
        eventName: "user-updated",
        data: { id: 1, name: "John" },
      });
    });

    it("creates an event message without data", () => {
      const message = createEventMessage("ping");
      expect(message).toEqual({
        type: "event",
        eventName: "ping",
      });
    });

    it("allows various data types", () => {
      const msg1 = createEventMessage("number", 42);
      const msg2 = createEventMessage("string", "hello");
      const msg3 = createEventMessage("array", [1, 2, 3]);
      const msg4 = createEventMessage("null", null);

      expect(msg1.data).toBe(42);
      expect(msg2.data).toBe("hello");
      expect(msg3.data).toEqual([1, 2, 3]);
      expect(msg4.data).toBe(null);
    });
  });

  describe("isEventMessage", () => {
    it("returns true for event messages", () => {
      const message = { type: "event" as const, eventName: "test", data: {} };
      expect(isEventMessage(message)).toBe(true);
    });

    it("returns true for event messages without data", () => {
      const message = { type: "event" as const, eventName: "test" };
      expect(isEventMessage(message)).toBe(true);
    });

    it("returns false for subscribe messages", () => {
      const message = { type: "subscribe" as const, eventName: "test" };
      expect(isEventMessage(message)).toBe(false);
    });

    it("returns false for unsubscribe messages", () => {
      const message = { type: "unsubscribe" as const, eventName: "test" };
      expect(isEventMessage(message)).toBe(false);
    });
  });

  describe("isSubscribeMessage", () => {
    it("returns true for subscribe messages", () => {
      const message = { type: "subscribe" as const, eventName: "test" };
      expect(isSubscribeMessage(message)).toBe(true);
    });

    it("returns false for event messages", () => {
      const message = { type: "event" as const, eventName: "test" };
      expect(isSubscribeMessage(message)).toBe(false);
    });

    it("returns false for unsubscribe messages", () => {
      const message = { type: "unsubscribe" as const, eventName: "test" };
      expect(isSubscribeMessage(message)).toBe(false);
    });
  });

  describe("isUnsubscribeMessage", () => {
    it("returns true for unsubscribe messages", () => {
      const message = { type: "unsubscribe" as const, eventName: "test" };
      expect(isUnsubscribeMessage(message)).toBe(true);
    });

    it("returns false for event messages", () => {
      const message = { type: "event" as const, eventName: "test" };
      expect(isUnsubscribeMessage(message)).toBe(false);
    });

    it("returns false for subscribe messages", () => {
      const message = { type: "subscribe" as const, eventName: "test" };
      expect(isUnsubscribeMessage(message)).toBe(false);
    });
  });
});
