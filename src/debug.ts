/**
 * Debug logging utilities for JSON-RPC clients
 */

import type { RpcLogEntry, RpcLogger } from "./types.js";

/**
 * Global debug state
 */
let globalDebugEnabled = false;
let customLogger: RpcLogger | null = null;

/**
 * Set global debug mode for all RPC clients
 *
 * @param enabled - Whether to enable debug logging
 *
 * @example
 * ```typescript
 * import { setRpcDebug } from 'electron-json-rpc/renderer';
 *
 * // Enable debug logging for all RPC clients
 * setRpcDebug(true);
 *
 * // Disable debug logging
 * setRpcDebug(false);
 * ```
 */
export function setRpcDebug(enabled: boolean): void {
  globalDebugEnabled = enabled;
}

/**
 * Check if global debug mode is enabled
 *
 * @returns True if debug mode is enabled
 *
 * @example
 * ```typescript
 * import { isRpcDebug } from 'electron-json-rpc/renderer';
 *
 * if (isRpcDebug()) {
 *   console.log('Debug logging is enabled');
 * }
 * ```
 */
export function isRpcDebug(): boolean {
  return globalDebugEnabled;
}

/**
 * Set a custom logger for RPC debug output
 *
 * @param logger - Logger function or null to reset to default
 *
 * @example
 * ```typescript
 * import { setRpcLogger } from 'electron-json-rpc/renderer';
 *
 * // Set custom logger
 * setRpcLogger((entry) => {
 *   console.log(`[${entry.type.toUpperCase()}] ${entry.method}`, entry);
 * });
 *
 * // Reset to default logger
 * setRpcLogger(null);
 * ```
 */
export function setRpcLogger(logger: RpcLogger | null): void {
  customLogger = logger;
}

/**
 * Get the current logger (custom or default)
 *
 * @internal
 */
export function getLogger(): RpcLogger {
  return customLogger ?? defaultLogger;
}

/**
 * Check if debug is enabled (either globally or via option)
 *
 * @internal
 */
export function isDebugEnabled(debugOption?: boolean): boolean {
  return globalDebugEnabled || debugOption === true;
}

/**
 * Format timestamp for debug output
 *
 * @internal
 */
export function formatTimestamp(timestamp: number): string {
  const time = new Date(timestamp);
  return time.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * ANSI color codes for terminal output
 *
 * @internal
 */
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
};

/**
 * Default logger implementation with formatted console output
 *
 * @internal
 */
const defaultLogger: RpcLogger = (entry: RpcLogEntry) => {
  const timeStr = formatTimestamp(entry.timestamp);
  const arrow =
    entry.type === "request" || entry.type === "notify" || entry.type === "event"
      ? "→"
      : entry.type === "stream"
        ? "↦"
        : "←";

  // Select color based on entry type
  let typeColor = colors.cyan;
  if (entry.type === "error") typeColor = colors.red;
  else if (entry.type === "response") typeColor = colors.green;
  else if (entry.type === "stream") typeColor = colors.yellow;
  else if (entry.type === "event") typeColor = colors.cyan;
  else if (entry.type === "notify") typeColor = colors.gray;

  // Build duration suffix
  let durationSuffix = "";
  if (entry.duration !== undefined) {
    const durationColor = entry.duration > 1000 ? colors.yellow : colors.dim;
    durationSuffix = ` ${durationColor}(${entry.duration}ms)${colors.reset}`;
  }

  // Build request ID suffix
  let idSuffix = "";
  if (entry.requestId !== undefined) {
    idSuffix = `${colors.dim} [#${entry.requestId}]${colors.reset}`;
  }

  // Main log line
  console.log(
    `${typeColor}[RPC]${colors.reset} ${colors.dim}${timeStr}${colors.reset} ${arrow} ${entry.type} ${entry.method}${idSuffix}${durationSuffix}`,
  );

  // Log params
  if (entry.params !== undefined && entry.params.length > 0) {
    console.log(`${colors.dim}  params:${colors.reset}`, entry.params);
  }

  // Log result
  if (entry.result !== undefined) {
    console.log(`${colors.dim}  result:${colors.reset}`, entry.result);
  }

  // Log error
  if (entry.error) {
    console.log(`${colors.red}  error:${colors.reset}`, entry.error);
  }
};

/**
 * Debug tracker interface
 */
export interface DebugTracker {
  onRequest: (method: string, params: unknown[], requestId: number) => void;
  onResponse: (
    method: string,
    params: unknown[],
    result: unknown,
    duration: number,
    requestId: number,
  ) => void;
  onError: (
    method: string,
    params: unknown[],
    error: string,
    duration: number,
    requestId: number,
  ) => void;
  onNotify: (method: string, params: unknown[]) => void;
  onStream: (method: string, params: unknown[]) => void;
  onEvent: (eventName: string, data: unknown) => void;
}

/**
 * Create a debug wrapper for tracking RPC calls
 *
 * @internal
 */
export function createDebugTracker(enabled: boolean, logger: RpcLogger): DebugTracker {
  if (!enabled) {
    return {
      onRequest: () => {},
      onResponse: () => {},
      onError: () => {},
      onNotify: () => {},
      onStream: () => {},
      onEvent: () => {},
    };
  }

  return {
    onRequest: (method, params, requestId) => {
      logger({
        type: "request",
        method,
        params,
        timestamp: Date.now(),
        requestId,
      });
    },
    onResponse: (method, params, result, duration, requestId) => {
      logger({
        type: "response",
        method,
        params,
        result,
        timestamp: Date.now(),
        duration,
        requestId,
      });
    },
    onError: (method, params, error, duration, requestId) => {
      logger({
        type: "error",
        method,
        params,
        error,
        timestamp: Date.now(),
        duration,
        requestId,
      });
    },
    onNotify: (method, params) => {
      logger({
        type: "notify",
        method,
        params,
        timestamp: Date.now(),
      });
    },
    onStream: (method, params) => {
      logger({
        type: "stream",
        method,
        params,
        timestamp: Date.now(),
      });
    },
    onEvent: (eventName, data) => {
      logger({
        type: "event",
        method: eventName,
        params: data !== undefined ? [data] : undefined,
        timestamp: Date.now(),
      });
    },
  };
}
