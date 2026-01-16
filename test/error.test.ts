/**
 * Tests for error utilities
 */

import { describe, it, expect } from "vitest";
import {
  createJsonRpcError,
  errors,
  isJsonRpcError,
  errorToJsonRpc,
  RpcTimeoutError,
  isTimeoutError,
  RpcQueueFullError,
  isQueueFullError,
  RpcConnectionError,
  isConnectionError,
  RpcQueueEvictedError,
  isQueueEvictedError,
} from "../src/error.js";
import { JsonRpcErrorCode } from "../src/types.js";

describe("error utilities", () => {
  describe("createJsonRpcError", () => {
    it("creates an error with code and message", () => {
      const error = createJsonRpcError(-32600, "Invalid request");
      expect(error).toEqual({
        code: -32600,
        message: "Invalid request",
      });
    });

    it("creates an error with code, message, and data", () => {
      const error = createJsonRpcError(-32600, "Invalid request", { details: "test" });
      expect(error).toEqual({
        code: -32600,
        message: "Invalid request",
        data: { details: "test" },
      });
    });
  });

  describe("errors object", () => {
    it("creates parse errors", () => {
      const error = errors.parseError();
      expect(error.code).toBe(JsonRpcErrorCode.ParseError);
      expect(error.message).toBe("Parse error");
    });

    it("creates parse errors with data", () => {
      const data = { line: 1, column: 5 };
      const error = errors.parseError(data);
      expect(error.data).toEqual(data);
    });

    it("creates invalid request errors", () => {
      const error = errors.invalidRequest();
      expect(error.code).toBe(JsonRpcErrorCode.InvalidRequest);
      expect(error.message).toBe("Invalid Request");
    });

    it("creates method not found errors", () => {
      const error = errors.methodNotFound("unknownMethod");
      expect(error.code).toBe(JsonRpcErrorCode.MethodNotFound);
      expect(error.message).toBe("Method not found: unknownMethod");
    });

    it("creates method not found errors without method name", () => {
      const error = errors.methodNotFound();
      expect(error.code).toBe(JsonRpcErrorCode.MethodNotFound);
      expect(error.message).toBe("Method not found");
    });

    it("creates invalid params errors", () => {
      const error = errors.invalidParams();
      expect(error.code).toBe(JsonRpcErrorCode.InvalidParams);
      expect(error.message).toBe("Invalid params");
    });

    it("creates internal errors", () => {
      const error = errors.internalError();
      expect(error.code).toBe(JsonRpcErrorCode.InternalError);
      expect(error.message).toBe("Internal error");
    });
  });

  describe("isJsonRpcError", () => {
    it("returns true for valid JsonRpcError objects", () => {
      const error = { code: -32600, message: "Invalid request" };
      expect(isJsonRpcError(error)).toBe(true);
    });

    it("returns true for JsonRpcError with data", () => {
      const error = { code: -32600, message: "Invalid request", data: {} };
      expect(isJsonRpcError(error)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isJsonRpcError(null)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isJsonRpcError("string")).toBe(false);
      expect(isJsonRpcError(123)).toBe(false);
      expect(isJsonRpcError(undefined)).toBe(false);
    });

    it("returns false for objects without code", () => {
      expect(isJsonRpcError({ message: "error" })).toBe(false);
    });

    it("returns false for objects without message", () => {
      expect(isJsonRpcError({ code: -32600 })).toBe(false);
    });

    it("returns false for objects with wrong types", () => {
      expect(isJsonRpcError({ code: "not a number", message: "error" })).toBe(false);
      expect(isJsonRpcError({ code: -32600, message: 123 })).toBe(false);
    });
  });

  describe("errorToJsonRpc", () => {
    it("returns same error if already a JsonRpcError", () => {
      const error = { code: -32600, message: "Invalid request" };
      expect(errorToJsonRpc(error)).toBe(error);
    });

    it("converts Error to JsonRpcError", () => {
      const error = new Error("Something went wrong");
      const result = errorToJsonRpc(error);
      expect(result).toEqual({
        code: JsonRpcErrorCode.InternalError,
        message: "Something went wrong",
        data: "Error",
      });
    });

    it("converts custom Error to JsonRpcError", () => {
      class CustomError extends Error {
        name = "CustomError";
      }
      const error = new CustomError("Custom message");
      const result = errorToJsonRpc(error);
      expect(result.code).toBe(JsonRpcErrorCode.InternalError);
      expect(result.message).toBe("Custom message");
      expect(result.data).toBe("CustomError");
    });

    it("converts unknown values to JsonRpcError", () => {
      const result = errorToJsonRpc("unknown");
      expect(result).toEqual({
        code: JsonRpcErrorCode.InternalError,
        message: "Unknown error",
        data: "unknown",
      });
    });

    it("converts null to JsonRpcError", () => {
      const result = errorToJsonRpc(null);
      expect(result).toEqual({
        code: JsonRpcErrorCode.InternalError,
        message: "Unknown error",
        data: null,
      });
    });
  });

  describe("RpcTimeoutError", () => {
    it("creates timeout error with default message", () => {
      const error = new RpcTimeoutError(5000);
      expect(error.name).toBe("RpcTimeoutError");
      expect(error.message).toBe("RPC call timed out after 5000ms");
      expect(error.timeout).toBe(5000);
    });

    it("is an Error instance", () => {
      const error = new RpcTimeoutError(5000);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isTimeoutError", () => {
    it("returns true for RpcTimeoutError", () => {
      const error = new RpcTimeoutError(5000);
      expect(isTimeoutError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isTimeoutError(new Error())).toBe(false);
      expect(isTimeoutError({ name: "RpcTimeoutError" } as any)).toBe(false);
    });
  });

  describe("RpcQueueFullError", () => {
    it("creates queue full error with current and max size", () => {
      const error = new RpcQueueFullError(10, 5);
      expect(error.name).toBe("RpcQueueFullError");
      expect(error.message).toBe("RPC queue is full (10/5)");
      expect(error.currentSize).toBe(10);
      expect(error.maxSize).toBe(5);
    });

    it("is an Error instance", () => {
      const error = new RpcQueueFullError(10, 5);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isQueueFullError", () => {
    it("returns true for RpcQueueFullError", () => {
      const error = new RpcQueueFullError(10, 5);
      expect(isQueueFullError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isQueueFullError(new Error())).toBe(false);
      expect(isQueueFullError({ name: "RpcQueueFullError" } as any)).toBe(false);
    });
  });

  describe("RpcConnectionError", () => {
    it("creates connection error with message", () => {
      const error = new RpcConnectionError("Connection lost");
      expect(error.name).toBe("RpcConnectionError");
      expect(error.message).toBe("Connection lost");
      expect(error.code).toBeUndefined();
    });

    it("creates connection error with message and code", () => {
      const error = new RpcConnectionError("Connection lost", "ECONNREFUSED");
      expect(error.name).toBe("RpcConnectionError");
      expect(error.message).toBe("Connection lost");
      expect(error.code).toBe("ECONNREFUSED");
    });

    it("is an Error instance", () => {
      const error = new RpcConnectionError("Connection lost");
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isConnectionError", () => {
    it("returns true for RpcConnectionError", () => {
      const error = new RpcConnectionError("Connection lost");
      expect(isConnectionError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isConnectionError(new Error())).toBe(false);
      expect(isConnectionError({ name: "RpcConnectionError" } as any)).toBe(false);
    });
  });

  describe("RpcQueueEvictedError", () => {
    it("creates evicted error with full reason", () => {
      const error = new RpcQueueEvictedError("full");
      expect(error.name).toBe("RpcQueueEvictedError");
      expect(error.message).toBe("Request evicted from queue: full");
      expect(error.reason).toBe("full");
    });

    it("creates evicted error with timeout reason", () => {
      const error = new RpcQueueEvictedError("timeout");
      expect(error.name).toBe("RpcQueueEvictedError");
      expect(error.message).toBe("Request evicted from queue: timeout");
      expect(error.reason).toBe("timeout");
    });

    it("is an Error instance", () => {
      const error = new RpcQueueEvictedError("full");
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isQueueEvictedError", () => {
    it("returns true for RpcQueueEvictedError", () => {
      const error = new RpcQueueEvictedError("full");
      expect(isQueueEvictedError(error)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isQueueEvictedError(new Error())).toBe(false);
      expect(isQueueEvictedError({ name: "RpcQueueEvictedError" } as any)).toBe(false);
    });
  });
});
