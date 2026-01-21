/**
 * JSON-RPC error utilities
 */

import type { JsonRpcError } from "./types.js";
import { JsonRpcErrorCode } from "./types.js";

/**
 * Create a JSON-RPC error object
 */
export function createJsonRpcError(code: number, message: string, data?: unknown): JsonRpcError {
  return { code, message, data };
}

/**
 * Predefined error creators
 */
export const errors = {
  parseError: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.ParseError, "Parse error", data),
  invalidRequest: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.InvalidRequest, "Invalid Request", data),
  methodNotFound: (method?: string) =>
    createJsonRpcError(
      JsonRpcErrorCode.MethodNotFound,
      `Method not found${method ? `: ${method}` : ""}`,
    ),
  invalidParams: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.InvalidParams, "Invalid params", data),
  internalError: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.InternalError, "Internal error", data),
};

/**
 * Check if an error is a JSON-RPC error
 */
export function isJsonRpcError(error: unknown): error is JsonRpcError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as JsonRpcError).code === "number" &&
    "message" in error &&
    typeof (error as JsonRpcError).message === "string"
  );
}

/**
 * Convert an Error object to JSON-RPC error
 */
export function errorToJsonRpc(error: unknown): JsonRpcError {
  if (isJsonRpcError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return {
      code: JsonRpcErrorCode.InternalError,
      message: error.message,
      data: error.name,
    };
  }

  return {
    code: JsonRpcErrorCode.InternalError,
    message: "Unknown error",
    data: error,
  };
}

/**
 * Timeout error class
 */
export class RpcTimeoutError extends Error {
  declare readonly name: "RpcTimeoutError";
  readonly timeout: number;

  constructor(timeout: number) {
    super(`RPC call timed out after ${timeout}ms`);
    this.name = "RpcTimeoutError";
    this.timeout = timeout;
  }
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): error is RpcTimeoutError {
  return error instanceof RpcTimeoutError;
}

/**
 * Error thrown when connection to main process is lost
 */
export class RpcConnectionError extends Error {
  declare readonly name: "RpcConnectionError";
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "RpcConnectionError";
    this.code = code;
  }
}

/**
 * Check if an error is a connection error
 */
export function isConnectionError(error: unknown): error is RpcConnectionError {
  return error instanceof RpcConnectionError;
}
