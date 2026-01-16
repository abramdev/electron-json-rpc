/**
 * Tests for renderer client utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createRpcClient,
  createTypedRpcClient,
  useRpcProxy,
  defineRpcApi,
} from "../../src/renderer/client.js";
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

describe("createRpcClient", () => {
  it("creates a client with call, notify, and stream methods", () => {
    const client = createRpcClient();

    expect(client).toHaveProperty("call");
    expect(client).toHaveProperty("notify");
    expect(client).toHaveProperty("stream");
    expect(typeof client.call).toBe("function");
    expect(typeof client.notify).toBe("function");
    expect(typeof client.stream).toBe("function");
  });

  it("throws error when API is not exposed", () => {
    delete (globalThis as any).rpc;

    expect(() => createRpcClient()).toThrow("RPC API not found");
  });

  it("calls API with method and params", async () => {
    mockApi.call.mockResolvedValue(42);

    const client = createRpcClient();
    const result = await client.call("add", 1, 2);

    expect(mockApi.call).toHaveBeenCalledWith("add", 1, 2);
    expect(result).toBe(42);
  });

  it("handles API errors", async () => {
    mockApi.call.mockRejectedValue(new Error("RPC error"));

    const client = createRpcClient();

    await expect(client.call("fail")).rejects.toThrow("RPC error");
  });

  it("sends notifications without waiting for response", () => {
    mockApi.notify = vi.fn();

    const client = createRpcClient();
    client.notify("log", "message");

    expect(mockApi.notify).toHaveBeenCalledWith("log", "message");
  });

  it("creates stream via API", () => {
    const mockStream = new ReadableStream();
    mockApi.stream.mockReturnValue(mockStream);

    const client = createRpcClient();
    const stream = client.stream("dataStream", 10);

    expect(mockApi.stream).toHaveBeenCalledWith("dataStream", 10);
    expect(stream).toBe(mockStream);
  });

  it("uses default timeout of 30000ms", async () => {
    const slowPromise = new Promise((resolve) => setTimeout(() => resolve("late"), 100));
    mockApi.call.mockReturnValue(slowPromise);

    const client = createRpcClient();
    const result = await client.call("slow");

    expect(result).toBe("late");
  });

  it("respects custom timeout", async () => {
    // Return a promise that never resolves
    mockApi.call.mockReturnValue(new Promise(() => {}));

    const client = createRpcClient({ timeout: 100 });

    await expect(client.call("timeout")).rejects.toThrow(RpcTimeoutError);
    await expect(client.call("timeout")).rejects.toThrow("timed out after 100ms");
  });

  it("uses custom API name", () => {
    const customApi = {
      call: vi.fn().mockResolvedValue({ result: 1 }),
      notify: vi.fn(),
      stream: vi.fn(),
    };
    (globalThis as any).customRpc = customApi;

    const client = createRpcClient({ apiName: "customRpc" });

    // Should not throw
    expect(client).toBeDefined();

    delete (globalThis as any).customRpc;
  });

  describe("debug tracking", () => {
    it("tracks requests when debug is enabled", async () => {
      const logger = vi.fn();
      mockApi.call.mockResolvedValue("ok");

      const client = createRpcClient({ debug: true, logger });
      await client.call("test", 1, 2);

      expect(logger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "request",
          method: "test",
          params: [1, 2],
        }),
      );
    });

    it("tracks responses when debug is enabled", async () => {
      const logger = vi.fn();
      mockApi.call.mockResolvedValue("ok");

      const client = createRpcClient({ debug: true, logger });
      await client.call("test");

      expect(logger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "response",
          method: "test",
        }),
      );
    });

    it("tracks errors when debug is enabled", async () => {
      const logger = vi.fn();
      mockApi.call.mockRejectedValue(new Error("Failed"));

      const client = createRpcClient({ debug: true, logger });
      try {
        await client.call("fail");
      } catch {
        // Expected
      }

      expect(logger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          method: "fail",
        }),
      );
    });
  });
});

describe("createTypedRpcClient", () => {
  interface TestApi {
    add: (a: number, b: number) => number;
    greet: (name: string) => Promise<string>;
    voidMethod: () => void;
  }

  it("creates a typed client with Proxy", () => {
    mockApi.call.mockResolvedValue({ result: 3 });

    const client = createTypedRpcClient<TestApi>();

    expect(typeof client.add).toBe("function");
    expect(typeof client.greet).toBe("function");
    expect(typeof client.voidMethod).toBe("function");
  });

  it("calls methods with correct params", async () => {
    mockApi.call.mockResolvedValue(5);

    const client = createTypedRpcClient<TestApi>();
    const result = await client.add(2, 3);

    expect(mockApi.call).toHaveBeenCalledWith("add", 2, 3);
    expect(result).toBe(5);
  });

  it("handles async methods", async () => {
    mockApi.call.mockResolvedValue("Hello, World!");

    const client = createTypedRpcClient<TestApi>();
    const result = await client.greet("World");

    expect(mockApi.call).toHaveBeenCalledWith("greet", "World");
    expect(result).toBe("Hello, World!");
  });

  it("respects custom timeout", async () => {
    mockApi.call.mockReturnValue(new Promise(() => {}));

    const client = createTypedRpcClient<TestApi>({ timeout: 50 });

    await expect(client.add(1, 2)).rejects.toThrow(RpcTimeoutError);
  });

  it("throws error when API is not exposed", () => {
    delete (globalThis as any).rpc;

    expect(() => createTypedRpcClient<TestApi>()).toThrow("RPC API not found");
  });
});

describe("useRpcProxy", () => {
  it("returns a proxy object", () => {
    const proxy = useRpcProxy();

    expect(proxy).toBeDefined();
    expect(typeof proxy).toBe("object");
  });

  it("uses exposed proxy if available", () => {
    const mockProxy = vi.fn().mockResolvedValue({ result: "proxied" });
    (globalThis as any).rpc = {
      proxy: () => mockProxy,
    };

    const proxy = useRpcProxy();
    expect(proxy).toBeDefined();
  });

  it("throws error when API is not exposed", () => {
    delete (globalThis as any).rpc;

    expect(() => useRpcProxy()).toThrow("RPC API not found");
  });

  it("creates generic proxy when no proxy method exposed", async () => {
    (globalThis as any).rpc = mockApi;
    mockApi.call.mockResolvedValue("ok");

    const proxy = useRpcProxy();
    // @ts-expect-error - testing dynamic access
    const result = await proxy.testMethod("arg");

    expect(mockApi.call).toHaveBeenCalledWith("testMethod", "arg");
    expect(result).toBe("ok");
  });
});

describe("defineRpcApi", () => {
  interface TestApi2 {
    multiply: (a: number, b: number) => number;
    divide: (a: number, b: number) => Promise<number>;
  }

  it("is an alias for createTypedRpcClient", () => {
    mockApi.call.mockResolvedValue(6);

    const api = defineRpcApi<TestApi2>();

    expect(typeof api.multiply).toBe("function");
    expect(typeof api.divide).toBe("function");
  });

  it("works with typed calls", async () => {
    mockApi.call.mockResolvedValue(8);

    const api = defineRpcApi<TestApi2>();
    const result = await api.multiply(2, 4);

    expect(result).toBe(8);
    expect(mockApi.call).toHaveBeenCalledWith("multiply", 2, 4);
  });
});
