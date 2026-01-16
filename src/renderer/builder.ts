/**
 * RpcBuilder for fluent API definition
 *
 * Build a typed RPC API by chaining method definitions.
 * Types are inferred from the handler functions.
 */

import type { RpcClientOptions, RpcDebugOptions } from "../types.js";
import { RpcTimeoutError } from "../error.js";
import { getLogger } from "../debug.js";
import { DEFAULT_API_NAME, getExposedApi, createTracker } from "./internal.js";

/**
 * RpcBuilder for fluent API definition
 *
 * Accumulates method definitions and builds a typed client.
 */
class RpcBuilder {
  private methods: Map<string, { kind: "call" | "stream" }> = new Map();
  private options: RpcClientOptions & RpcDebugOptions;
  private apiName: string;

  constructor(
    options: RpcClientOptions & RpcDebugOptions = {},
    apiName: string = DEFAULT_API_NAME,
  ) {
    this.options = options;
    this.apiName = apiName;
  }

  /**
   * Add a regular RPC method
   *
   * @param name - Method name
   * @param _handler - Handler function for type inference only (not executed)
   * @returns Builder with method added
   */
  add<K extends string, P extends any[], R>(
    name: K,
    _handler: (...args: P) => R,
  ): RpcBuilderWithMethod<K, P, R> {
    this.methods.set(name, { kind: "call" });
    return this as unknown as RpcBuilderWithMethod<K, P, R>;
  }

  /**
   * Add a stream RPC method
   *
   * @param name - Method name
   * @param _handler - Handler function for type inference only (not executed)
   * @returns Builder with stream method added
   */
  stream<K extends string, P extends any[], R>(
    name: K,
    _handler: (...args: P) => R,
  ): RpcBuilderWithMethod<K, P, R> {
    this.methods.set(name, { kind: "stream" });
    return this as unknown as RpcBuilderWithMethod<K, P, R>;
  }

  /**
   * Build the final typed API client
   *
   * @returns Typed RPC client
   */
  build(): Record<string, (...args: any[]) => any> {
    const api = getExposedApi(this.apiName);
    if (!api) {
      throw new Error(
        `RPC API not found. Make sure exposeRpcApi() is called in your preload script with apiName='${this.apiName}'.`,
      );
    }

    const { timeout = 30000, debug, logger } = this.options;

    const debugTracker = createTracker(debug, logger ?? getLogger());
    const requestIdCounter = { value: 0 };

    // Capture methods map for use in proxy
    const methods = this.methods;

    // Create a proxy that routes method calls to the underlying API
    return new Proxy({} as Record<string, (...args: any[]) => any>, {
      get(_target, prop: string) {
        const methodInfo = methods.get(prop);
        if (!methodInfo) {
          throw new Error(`Method '${prop}' was not registered in the RPC builder`);
        }

        if (methodInfo.kind === "stream") {
          return (...args: unknown[]) => {
            debugTracker.onStream(prop, args);
            return api.stream(prop, ...args);
          };
        }

        // Regular method - handle both calls and notifications
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
}

/**
 * Builder type with one method added
 * Provides fluent chaining for building the API
 */
type RpcBuilderWithMethod<K extends string, P extends any[], R> = {
  [M in K]: (...args: P) => R extends void ? void : Promise<Awaited<R>>;
} & Omit<RpcBuilderMethods, K>;

/**
 * Available methods on the builder
 */
type RpcBuilderMethods = {
  add: <K extends string, P extends any[], R>(
    name: K,
    handler: (...args: P) => R,
  ) => RpcBuilderWithMethod<K, P, R>;
  stream: <K extends string, P extends any[], R>(
    name: K,
    handler: (...args: P) => R,
  ) => RpcBuilderWithMethod<K, P, R>;
  build: () => Record<string, (...args: any[]) => any>;
};

/**
 * Create a fluent RPC API builder
 *
 * Build a typed RPC API by chaining method definitions.
 * Types are inferred from the handler functions.
 *
 * @param options - Client options
 * @returns Builder instance
 */
export function createRpc(options: RpcClientOptions & RpcDebugOptions = {}): Omit<
  RpcBuilder,
  "build"
> & {
  build: () => Record<string, (...args: any[]) => any>;
} {
  return new RpcBuilder(options);
}

/**
 * Re-export types for convenience
 */
export type { RpcBuilder, RpcBuilderMethods, RpcBuilderWithMethod };
