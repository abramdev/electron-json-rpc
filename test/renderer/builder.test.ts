/**
 * Tests for renderer builder utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRpc } from "../../src/renderer/builder.js";
import { RpcTimeoutError } from "../../src/error.js";

// Mock window.rpc
const mockApi = {
  call: vi.fn(),
  notify: vi.fn(),
  stream: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).rpc = mockApi;
});

describe("createRpc builder", () => {
  it("creates a builder instance", () => {
    const builder = createRpc();

    expect(builder).toHaveProperty("add");
    expect(builder).toHaveProperty("stream");
    expect(builder).toHaveProperty("build");
    expect(typeof builder.add).toBe("function");
    expect(typeof builder.stream).toBe("function");
    expect(typeof builder.build).toBe("function");
  });

  it("chains method definitions", () => {
    const builder = createRpc()
      .add("add", (a: number, b: number) => a + b)
      .add("subtract", (a: number, b: number) => a - b);

    // Note: The chaining is type-level only, runtime properties don't exist
    // The type system ensures methods are available via the builder's return type
    expect(builder).toHaveProperty("add");
    expect(typeof builder.add).toBe("function");
    expect(builder).toHaveProperty("stream");
    expect(builder).toHaveProperty("build");
  });

  it("chains stream method definitions", () => {
    const builder = createRpc().stream("dataStream", (count: number) => count);

    // Note: Stream methods use type-level magic
    expect(builder).toHaveProperty("add");
    expect(builder).toHaveProperty("stream");
    expect(typeof builder.stream).toBe("function");
  });

  describe("build", () => {
    it("throws error when API is not exposed", () => {
      delete (globalThis as any).rpc;

      const builder = createRpc().add("test", () => "result");

      expect(() => builder.build()).toThrow("RPC API not found");
    });

    it("creates callable client", async () => {
      mockApi.call.mockResolvedValue(5);

      const builder = createRpc().add("add", (a: number, b: number) => a + b);
      const client = builder.build();

      const result = await client.add(2, 3);

      expect(mockApi.call).toHaveBeenCalledWith("add", 2, 3);
      expect(result).toBe(5);
    });

    it("creates stream client", () => {
      const mockStream = new ReadableStream();
      mockApi.stream.mockReturnValue(mockStream);

      const builder = createRpc().stream("items", () => []);
      const client = builder.build();

      const stream = client.items(10);

      expect(mockApi.stream).toHaveBeenCalledWith("items", 10);
      expect(stream).toBe(mockStream);
    });

    it("throws error for unregistered methods", () => {
      mockApi.call.mockResolvedValue("ok");

      const builder = createRpc().add("known", () => "result");
      const client = builder.build();

      // Calling an unknown method should throw synchronously
      expect(() => {
        // @ts-expect-error - testing unknown method
        client.unknown();
      }).toThrow("was not registered");
    });

    it("respects custom timeout", async () => {
      mockApi.call.mockReturnValue(new Promise(() => {}));

      const builder = createRpc({ timeout: 50 }).add("slow", () => "result");
      const client = builder.build();

      await expect(client.slow()).rejects.toThrow(RpcTimeoutError);
    });
  });

  describe("type inference", () => {
    it("infers types from handler functions", async () => {
      mockApi.call
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce("hello")
        .mockResolvedValueOnce(true);

      const builder = createRpc()
        .add("add", (a: number, b: number) => a + b)
        .add("greet", (name: string) => `Hello, ${name}`)
        .add("check", (value: unknown) => !!value);

      const client = builder.build();

      const sum = await client.add(1, 2);
      const greeting = await client.greet("World");
      const bool = await client.check(0);

      expect(sum).toBe(5);
      expect(greeting).toBe("hello");
      expect(bool).toBe(true);
    });

    it("handles async handler types", async () => {
      mockApi.call.mockResolvedValue("async result");

      const builder = createRpc().add("asyncOp", async (input: string) => {
        return input.toUpperCase();
      });

      const client = builder.build();
      const result = await client.asyncOp("test");

      expect(result).toBe("async result");
    });

    it("handles void return types (notifications)", async () => {
      mockApi.call.mockResolvedValue(undefined);

      const builder = createRpc().add("notify", () => {
        // void return
      });

      const client = builder.build();
      // void methods should still return Promise in the client
      const result = await client.notify();
      expect(result).toBeUndefined();
    });
  });

  describe("debug tracking", () => {
    it("tracks requests when debug is enabled", async () => {
      const logger = vi.fn();
      mockApi.call.mockResolvedValue("ok");

      const builder = createRpc({ debug: true, logger }).add("test", () => "result");
      const client = builder.build();
      await client.test();

      expect(logger).toHaveBeenCalled();
    });
  });

  describe("custom API name", () => {
    it("uses custom API name", () => {
      const customApi = {
        call: vi.fn().mockResolvedValue(1),
        notify: vi.fn(),
        stream: vi.fn(),
      };
      (globalThis as any).customRpc = customApi;

      const builder = createRpc({ apiName: "customRpc" }).add("test", () => "result");
      const client = builder.build();

      expect(client).toBeDefined();

      delete (globalThis as any).customRpc;
    });
  });

  describe("mixed methods", () => {
    it("handles both regular and stream methods", async () => {
      mockApi.call.mockResolvedValue("regular");
      const mockStream = new ReadableStream();
      mockApi.stream.mockReturnValue(mockStream);

      const builder = createRpc()
        .add("regularMethod", () => "result")
        .stream("streamMethod", (count: number) => count);

      const client = builder.build();

      const regularResult = await client.regularMethod();
      const streamResult = client.streamMethod(10);

      expect(mockApi.call).toHaveBeenCalledWith("regularMethod");
      expect(mockApi.stream).toHaveBeenCalledWith("streamMethod", 10);
      expect(regularResult).toBe("regular");
      expect(streamResult).toBe(mockStream);
    });
  });
});
