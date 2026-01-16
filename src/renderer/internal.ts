/**
 * Internal utilities for renderer modules
 */

import type { RpcLogger } from "../types.js";
import { isDebugEnabled, createDebugTracker, type DebugTracker } from "../debug.js";

/**
 * Default API name exposed by preload
 */
export const DEFAULT_API_NAME = "rpc";

/**
 * Preload API type
 */
export type PreloadApi = {
  call: (method: string, ...params: unknown[]) => Promise<unknown>;
  notify: (method: string, ...params: unknown[]) => void;
  stream: (method: string, ...params: unknown[]) => ReadableStream;
  on?: (eventName: string, callback: (data?: unknown) => void) => () => void;
  off?: (eventName: string, callback?: (data?: unknown) => void) => void;
  once?: (eventName: string, callback: (data?: unknown) => void) => void;
  proxy?: <T>(methodNames?: (keyof T)[]) => T;
};

/**
 * Get the exposed API from window object
 */
export function getExposedApi(apiName: string): PreloadApi | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win[apiName] ?? null;
}

/**
 * Create debug tracker with optional logger
 */
export function createTracker(
  debug: boolean | undefined,
  logger: RpcLogger | undefined,
): DebugTracker {
  const enabled = isDebugEnabled(debug);
  return createDebugTracker(enabled, logger ?? (() => {}));
}
