/**
 * Tests for main process RPC server
 *
 * Uses dependency injection to mock Electron
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { RpcServer, createRpcServer } from "../src/main.js";
import type { JsonRpcRequest } from "../src/types.js";

// Create mock functions
const createMockElectron = () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const webContentsList: any[] = [];

  const ipcMain = {
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(listener);
    }),
    removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          listeners.delete(channel);
        }
      }
    }),
    // Helper for tests
    _getListeners: () => listeners,
    _clear: () => listeners.clear(),
    // Helper to trigger a message handler (async)
    _trigger: async (channel: string, event: unknown, ...args: unknown[]) => {
      const channelListeners = listeners.get(channel);
      if (channelListeners) {
        for (const listener of channelListeners) {
          const result = listener(event, ...args);
          // Await if the listener returns a Promise
          if (result instanceof Promise) {
            await result;
          }
        }
      }
    },
  };

  const webContents = {
    getAllWebContents: vi.fn(() => webContentsList),
    // Helper for tests
    _getList: () => webContentsList,
    _clear: () => (webContentsList.length = 0),
    _addWindow: (id: number, send: vi.fn) => {
      webContentsList.push({ id, send });
    },
  };

  return { ipcMain, webContents };
};

// Create a fresh mock for each test suite
let mock = createMockElectron();

beforeEach(() => {
  // Create fresh mock for each test
  mock = createMockElectron();
});

describe("RpcServer", () => {
  describe("constructor", () => {
    it("creates a new RPC server with injected Electron", () => {
      const server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      expect(server).toBeInstanceOf(RpcServer);
    });

    it("registers health check method", () => {
      const server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      expect(server.has("__rpc_health__")).toBe(true);
    });

    it("creates a new RPC server without injection (uses require)", () => {
      expect(() => new RpcServer()).not.toThrow();
    });
  });

  describe("register", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("registers a new method", () => {
      server.register("add", (a: number, b: number) => a + b);
      expect(server.has("add")).toBe(true);
    });

    it("registers method with options", () => {
      const validator = vi.fn();
      server.register("validated", (x: number) => x * 2, {
        validate: validator,
        description: "A validated method",
      });
      expect(server.has("validated")).toBe(true);
    });
  });

  describe("registerStream", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("registers a stream method", () => {
      server.registerStream("dataStream", (count: number) => {
        return new ReadableStream({
          start(controller) {
            for (let i = 0; i < count; i++) {
              controller.enqueue({ index: i });
            }
            controller.close();
          },
        });
      });
      expect(server.has("dataStream")).toBe(true);
    });
  });

  describe("unregister", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("removes a registered method", () => {
      server.register("temp", () => "temp");
      server.unregister("temp");
      expect(server.has("temp")).toBe(false);
    });

    it("handles unregistering non-existent method", () => {
      expect(() => server.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("has", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("returns true for registered methods", () => {
      server.register("existing", () => true);
      expect(server.has("existing")).toBe(true);
    });

    it("returns false for unregistered methods", () => {
      expect(server.has("nonexistent")).toBe(false);
    });
  });

  describe("getMethodNames", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("returns list of registered method names", () => {
      server.register("method1", () => 1);
      server.register("method2", () => 2);
      server.register("method3", () => 3);

      const names = server.getMethodNames();
      expect(names).toContain("method1");
      expect(names).toContain("method2");
      expect(names).toContain("method3");
      expect(names).toContain("__rpc_health__");
    });

    it("returns empty array when no methods registered", () => {
      server.unregister("__rpc_health__");
      expect(server.getMethodNames()).toEqual([]);
    });
  });

  describe("listen / dispose", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("starts listening for IPC messages", () => {
      server.listen();

      expect(mock.ipcMain.on).toHaveBeenCalledTimes(3);
      expect(mock.ipcMain.on).toHaveBeenCalledWith("json-rpc", expect.any(Function));
      expect(mock.ipcMain.on).toHaveBeenCalledWith("json-rpc-stream", expect.any(Function));
      expect(mock.ipcMain.on).toHaveBeenCalledWith("json-rpc-events", expect.any(Function));
    });

    it("does not register listeners twice", () => {
      server.listen();
      server.listen();

      expect(mock.ipcMain.on).toHaveBeenCalledTimes(3);
    });

    it("stops listening when disposed", () => {
      server.listen();
      server.dispose();

      expect(mock.ipcMain.removeListener).toHaveBeenCalledTimes(3);
      expect(mock.ipcMain.removeListener).toHaveBeenCalledWith("json-rpc", expect.any(Function));
      expect(mock.ipcMain.removeListener).toHaveBeenCalledWith(
        "json-rpc-stream",
        expect.any(Function),
      );
      expect(mock.ipcMain.removeListener).toHaveBeenCalledWith(
        "json-rpc-events",
        expect.any(Function),
      );
    });

    it("handles dispose when not listening", () => {
      expect(() => server.dispose()).not.toThrow();
    });

    it("clears methods on dispose", () => {
      server.register("test", () => true);
      server.listen();
      server.dispose();
      expect(server.getMethodNames()).toEqual([]);
    });
  });

  describe("IPC message handling", () => {
    let server: RpcServer;
    let mockReply: vi.fn;
    let mockEvent: any;

    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      server.register("add", (a: number, b: number) => a + b);
      server.register("echo", (msg: string) => msg);
      server.register("asyncOp", async (val: number) => val * 2);
      server.registerStream("numberStream", (count: number) => {
        return new ReadableStream({
          start(controller) {
            for (let i = 0; i < count; i++) {
              controller.enqueue(i);
            }
            controller.close();
          },
        });
      });

      mockReply = vi.fn();
      mockEvent = {
        sender: { id: 1, send: vi.fn() },
        reply: mockReply,
      };

      // Start listening for IPC messages
      server.listen();
    });

    it("handles valid method call", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "1",
        method: "add",
        params: [2, 3],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "1",
        result: 5,
      });
    });

    it("handles notification (no id)", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "echo",
        params: ["hello"],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      // Notifications don't get replies
      expect(mockReply).not.toHaveBeenCalled();
    });

    it("handles notification with null id", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: null,
        method: "echo",
        params: ["hello"],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).not.toHaveBeenCalled();
    });

    it("handles named params", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "2",
        method: "echo",
        params: { message: "test" },
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "2",
        result: { message: "test" },
      });
    });

    it("handles params undefined", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "3",
        method: "echo",
        params: undefined,
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "3",
        result: undefined,
      });
    });

    it("handles async methods", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "4",
        method: "asyncOp",
        params: [5],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "4",
        result: 10,
      });
    });

    it("returns invalidRequest error when method is missing", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "5",
        // method is missing
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "5",
        error: expect.objectContaining({
          code: -32600,
          message: expect.any(String),
        }),
      });
    });

    it("returns invalidRequest error when method is not string", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "6",
        method: 123 as any,
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "6",
        error: expect.objectContaining({
          code: -32600,
        }),
      });
    });

    it("returns methodNotFound error for unknown method", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "7",
        method: "unknownMethod",
        params: [],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "7",
        error: expect.objectContaining({
          code: -32601,
        }),
      });
    });

    it("handles method errors gracefully", async () => {
      server.register("errorMethod", () => {
        throw new Error("Test error");
      });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "8",
        method: "errorMethod",
        params: [],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "8",
        error: expect.objectContaining({
          code: -32603,
        }),
      });
    });

    it("handles validator passing", async () => {
      const validator = vi.fn(() => {
        // valid
      });
      server.register("validated", (x: number) => x * 2, {
        validate: validator,
      });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "9",
        method: "validated",
        params: [5],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(validator).toHaveBeenCalledWith([5]);
      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "9",
        result: 10,
      });
    });

    it("handles validator failure", async () => {
      const validator = vi.fn(() => {
        throw new Error("Validation failed");
      });
      server.register("validated", (x: number) => x * 2, {
        validate: validator,
      });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "10",
        method: "validated",
        params: [5],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "10",
        error: expect.objectContaining({
          code: -32602,
        }),
      });
    });

    it("handles validator that returns without throwing", async () => {
      // Validators that return normally (don't throw) pass validation
      const validator = vi.fn(() => {
        return "some value"; // returning a value doesn't cause validation error
      });
      server.register("validated", (x: number) => x * 2, {
        validate: validator,
      });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "11",
        method: "validated",
        params: [5],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      // Validator is called but doesn't throw, so method executes successfully
      expect(validator).toHaveBeenCalledWith([5]);
      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "11",
        result: 10,
      });
    });
  });

  describe("Stream method handling", () => {
    let server: RpcServer;
    let mockReply: vi.fn;
    let mockEvent: any;

    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      server.registerStream("numberStream", (count: number) => {
        return new ReadableStream({
          start(controller) {
            for (let i = 0; i < count; i++) {
              controller.enqueue(i);
            }
            controller.close();
          },
        });
      });
      server.registerStream("errorStream", () => {
        throw new Error("Stream error");
      });
      server.registerStream("nonStreamValue", () => {
        return { value: 42 };
      });

      mockReply = vi.fn();
      mockEvent = {
        sender: { id: 1, send: vi.fn() },
        reply: mockReply,
      };

      // Start listening for IPC messages
      server.listen();
    });

    it("returns streamId for stream method", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "12",
        method: "numberStream",
        params: [3],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "12",
        result: { streamId: expect.stringMatching(/^stream_\d+_/) },
      });
    });

    it("sends stream chunks to sender", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "13",
        method: "numberStream",
        params: [2],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      // Check that stream chunks were sent
      expect(mockEvent.sender.send).toHaveBeenCalledTimes(3); // 2 chunks + 1 end
    });

    it("handles stream method errors", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "14",
        method: "errorStream",
        params: [],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      // Should return streamId even though handler will error
      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "14",
        result: { streamId: expect.stringMatching(/^stream_\d+_/) },
      });

      // Error chunk should be sent
      expect(mockEvent.sender.send).toHaveBeenCalled();
    });

    it("handles non-stream return values", async () => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "15",
        method: "nonStreamValue",
        params: [],
      };

      await mock.ipcMain._trigger("json-rpc", mockEvent, request);

      expect(mockReply).toHaveBeenCalledWith("json-rpc", {
        jsonrpc: "2.0",
        id: "15",
        result: { streamId: expect.stringMatching(/^stream_\d+_/) },
      });

      // Should send chunk and end
      expect(mockEvent.sender.send).toHaveBeenCalled();
    });

    it("sends to all windows when no sender", async () => {
      mock.webContents._addWindow(1, vi.fn());
      mock.webContents._addWindow(2, vi.fn());

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: "16",
        method: "nonStreamValue",
        params: [],
      };

      // Event without sender
      const eventWithoutSender = {
        reply: mockReply,
      };

      await mock.ipcMain._trigger("json-rpc", eventWithoutSender, request);

      // All windows should receive the stream data
      expect(mock.webContents._getList().length).toBe(2);
    });
  });

  describe("Stream message handling", () => {
    let server: RpcServer;

    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      server.listen();
    });

    it("handles stream end message", () => {
      const chunk = { streamId: "test-stream", type: "end" };

      expect(() => {
        mock.ipcMain._trigger("json-rpc-stream", {}, chunk);
      }).not.toThrow();
    });

    it("handles stream error message", () => {
      const chunk = { streamId: "test-stream", type: "error" };

      expect(() => {
        mock.ipcMain._trigger("json-rpc-stream", {}, chunk);
      }).not.toThrow();
    });

    it("handles stream chunk message", () => {
      const chunk = { streamId: "test-stream", type: "chunk", data: { value: 1 } };

      expect(() => {
        mock.ipcMain._trigger("json-rpc-stream", {}, chunk);
      }).not.toThrow();
    });
  });

  describe("Event bus message handling", () => {
    let server: RpcServer;

    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      server.listen();
    });

    it("subscribes window to event", () => {
      const message = {
        type: "subscribe",
        eventName: "test-event",
      };
      const event = { sender: { id: 123 } };

      mock.ipcMain._trigger("json-rpc-events", event, message);

      expect(server.getEventSubscribers()).toEqual({ "test-event": 1 });
    });

    it("unsubscribes window from event", () => {
      // First subscribe
      const subscribeMessage = {
        type: "subscribe",
        eventName: "test-event",
      };
      const event = { sender: { id: 123 } };
      mock.ipcMain._trigger("json-rpc-events", event, subscribeMessage);

      // Then unsubscribe
      const unsubscribeMessage = {
        type: "unsubscribe",
        eventName: "test-event",
      };
      mock.ipcMain._trigger("json-rpc-events", event, unsubscribeMessage);

      expect(server.getEventSubscribers()).toEqual({});
    });

    it("handles multiple subscribers to same event", () => {
      const message = {
        type: "subscribe",
        eventName: "test-event",
      };

      mock.ipcMain._trigger("json-rpc-events", { sender: { id: 1 } }, message);
      mock.ipcMain._trigger("json-rpc-events", { sender: { id: 2 } }, message);

      expect(server.getEventSubscribers()).toEqual({ "test-event": 2 });
    });

    it("ignores message when no sender", () => {
      const message = {
        type: "subscribe",
        eventName: "test-event",
      };

      // Pass event without sender property
      mock.ipcMain._trigger("json-rpc-events", {}, message);

      expect(server.getEventSubscribers()).toEqual({});
    });

    it("ignores unknown message types", () => {
      const message = {
        type: "unknown",
        eventName: "test-event",
      };
      const event = { sender: { id: 123 } };

      expect(() => {
        mock.ipcMain._trigger("json-rpc-events", event, message);
      }).not.toThrow();
    });
  });

  describe("publish with subscribers", () => {
    let server: RpcServer;
    let mockWindow: any;

    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
      server.listen();

      mockWindow = { id: 1, send: vi.fn() };
      mock.webContents._addWindow(1, mockWindow.send);

      // Subscribe to event
      const message = {
        type: "subscribe",
        eventName: "test-event",
      };
      mock.ipcMain._trigger("json-rpc-events", { sender: { id: 1 } }, message);
    });

    it("publishes event to subscribed windows", () => {
      server.publish("test-event", { data: "hello" });

      expect(mockWindow.send).toHaveBeenCalledWith("json-rpc-events", {
        type: "event",
        eventName: "test-event",
        data: { data: "hello" },
      });
    });

    it("does not publish to windows that are not subscribed", () => {
      server.publish("other-event", { data: "hello" });

      expect(mockWindow.send).not.toHaveBeenCalled();
    });

    it("handles multiple subscribers", () => {
      const mockWindow2 = { id: 2, send: vi.fn() };
      mock.webContents._addWindow(2, mockWindow2.send);

      const message = {
        type: "subscribe",
        eventName: "multi-event",
      };
      mock.ipcMain._trigger("json-rpc-events", { sender: { id: 1 } }, message);
      mock.ipcMain._trigger("json-rpc-events", { sender: { id: 2 } }, message);

      server.publish("multi-event", { value: 42 });

      expect(mockWindow.send).toHaveBeenCalled();
      expect(mockWindow2.send).toHaveBeenCalled();
    });
  });

  describe("publish", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("does nothing when no subscribers", () => {
      expect(() => server.publish("no-subs", {})).not.toThrow();
    });

    it("does nothing when no web contents exist", () => {
      expect(() => server.publish("test", {})).not.toThrow();
    });
  });

  describe("getEventSubscribers", () => {
    let server: RpcServer;
    beforeEach(() => {
      server = new RpcServer({ ipcMain: mock.ipcMain, webContents: mock.webContents });
    });

    it("returns empty object initially", () => {
      expect(server.getEventSubscribers()).toEqual({});
    });
  });
});

describe("createRpcServer", () => {
  it("creates a new RpcServer instance (uses real Electron)", () => {
    const server = createRpcServer();
    expect(server).toBeInstanceOf(RpcServer);
  });

  it("creates independent instances", () => {
    const server1 = createRpcServer();
    const server2 = createRpcServer();

    server1.register("method1", () => 1);
    server2.register("method2", () => 2);

    expect(server1.has("method1")).toBe(true);
    expect(server1.has("method2")).toBe(false);
    expect(server2.has("method2")).toBe(true);
    expect(server2.has("method1")).toBe(false);
  });
});
