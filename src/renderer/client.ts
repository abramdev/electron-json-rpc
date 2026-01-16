/**
 * JSON-RPC Client for Electron Renderer Process
 *
 * Basic client functionality: createRpcClient, createTypedRpcClient, useRpcProxy, defineRpcApi
 */

import type { RpcApi, RpcClientOptions, RpcDebugOptions } from "../types.js";
import { RpcTimeoutError } from "../error.js";
import { getLogger } from "../debug.js";
import { DEFAULT_API_NAME, getExposedApi, createTracker } from "./internal.js";

/**
 * Create an untyped RPC client
 *
 * @param options - Client options
 * @returns RPC client with call/notify/stream methods
 */
export function createRpcClient(options: RpcClientOptions & RpcDebugOptions = {}): {
  call: <T = unknown>(method: string, ...params: unknown[]) => Promise<T>;
  notify: (method: string, ...params: unknown[]) => void;
  stream: (method: string, ...params: unknown[]) => ReadableStream;
} {
  const { timeout = 30000, apiName = DEFAULT_API_NAME, debug, logger } = options;
  const api = getExposedApi(apiName);

  if (!api) {
    throw new Error(
      `RPC API not found. Make sure exposeRpcApi() is called in your preload script with apiName='${apiName}'.`,
    );
  }

  const debugTracker = createTracker(debug, logger ?? getLogger());
  const requestIdCounter = { value: 0 };

  return {
    call: <T = unknown>(method: string, ...params: unknown[]): Promise<T> => {
      const requestId = ++requestIdCounter.value;
      const startTime = performance.now();

      debugTracker.onRequest(method, params, requestId);

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const duration = Math.round(performance.now() - startTime);
          debugTracker.onError(method, params, `Timeout after ${timeout}ms`, duration, requestId);
          reject(new RpcTimeoutError(timeout));
        }, timeout);

        api
          .call(method, ...params)
          .then((result: unknown) => {
            clearTimeout(timeoutId);
            const duration = Math.round(performance.now() - startTime);
            debugTracker.onResponse(method, params, result, duration, requestId);
            resolve(result as T);
          })
          .catch((error: Error) => {
            clearTimeout(timeoutId);
            const duration = Math.round(performance.now() - startTime);
            debugTracker.onError(method, params, error.message, duration, requestId);
            reject(error);
          });
      });
    },

    notify: (method: string, ...params: unknown[]): void => {
      debugTracker.onNotify(method, params);
      api.notify(method, ...params);
    },

    stream: (method: string, ...params: unknown[]): ReadableStream => {
      debugTracker.onStream(method, params);
      return api.stream(method, ...params);
    },
  };
}

/**
 * Create a typed RPC client with full type safety
 *
 * @param options - Client options
 * @returns Typed proxy client
 */
export function createTypedRpcClient<T extends Record<string, (...args: any[]) => any>>(
  options: RpcClientOptions & RpcDebugOptions = {},
): RpcApi<T> {
  const { timeout = 30000, apiName = DEFAULT_API_NAME, debug, logger } = options;
  const api = getExposedApi(apiName);

  if (!api) {
    throw new Error(
      `RPC API not found. Make sure exposeRpcApi() is called in your preload script with apiName='${apiName}'.`,
    );
  }

  const debugTracker = createTracker(debug, logger ?? getLogger());
  const requestIdCounter = { value: 0 };

  return new Proxy({} as RpcApi<T>, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        const requestId = ++requestIdCounter.value;
        const startTime = performance.now();

        debugTracker.onRequest(prop, args, requestId);

        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            const duration = Math.round(performance.now() - startTime);
            debugTracker.onError(prop, args, `Timeout after ${timeout}ms`, duration, requestId);
            reject(new RpcTimeoutError(timeout));
          }, timeout);

          api
            .call(prop, ...args)
            .then((result: unknown) => {
              clearTimeout(timeoutId);
              const duration = Math.round(performance.now() - startTime);
              debugTracker.onResponse(prop, args, result, duration, requestId);
              resolve(result as any);
            })
            .catch((error: Error) => {
              clearTimeout(timeoutId);
              const duration = Math.round(performance.now() - startTime);
              debugTracker.onError(prop, args, error.message, duration, requestId);
              reject(error);
            });
        });
      };
    },
  });
}

/**
 * Create a RPC client using the preload proxy method
 * This allows the preload script to expose a typed proxy
 *
 * @param options - Client options
 * @returns RPC client or proxy
 */
export function useRpcProxy(
  options: RpcClientOptions & RpcDebugOptions = {},
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const { apiName = DEFAULT_API_NAME, debug, logger } = options;
  const api = getExposedApi(apiName);

  if (!api) {
    throw new Error(
      `RPC API not found. Make sure exposeRpcApi() is called in your preload script with apiName='${apiName}'.`,
    );
  }

  // If preload exposed a proxy method, use it
  if (typeof api.proxy === "function") {
    return api.proxy();
  }

  const debugTracker = createTracker(debug, logger ?? getLogger());
  const requestIdCounter = { value: 0 };

  // Otherwise, return a generic proxy
  return new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        const requestId = ++requestIdCounter.value;
        const startTime = performance.now();

        debugTracker.onRequest(prop, args, requestId);

        return api
          .call(prop, ...args)
          .then((result: unknown) => {
            const duration = Math.round(performance.now() - startTime);
            debugTracker.onResponse(prop, args, result, duration, requestId);
            return result;
          })
          .catch((error: Error) => {
            const duration = Math.round(performance.now() - startTime);
            debugTracker.onError(prop, args, error.message, duration, requestId);
            throw error;
          });
      };
    },
  });
}

/**
 * Define a typed RPC API from an interface
 *
 * This is an alias for createTypedRpcClient with a more semantic name
 * for defining API interfaces.
 *
 * @param options - Client options
 * @returns Typed proxy client
 */
export function defineRpcApi<T extends Record<string, (...args: any[]) => any>>(
  options: RpcClientOptions & RpcDebugOptions = {},
): RpcApi<T> {
  return createTypedRpcClient<T>(options);
}

/**
 * Re-export types for convenience
 */
export type { RpcApi, RpcClientOptions } from "../types.js";
