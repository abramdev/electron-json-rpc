/**
 * JSON-RPC 2.0 types for Electron IPC communication
 */

/**
 * JSON-RPC 2.0 Request
 * id is optional for notifications (one-way calls)
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 Error codes
 */
export enum JsonRpcErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

/**
 * RPC method handler type
 */
export type RpcHandler = (...params: unknown[]) => unknown | Promise<unknown>;

/**
 * Validator function for params
 * Throw an error to reject the request with InvalidParams error
 */
export type RpcValidator = (params: unknown[]) => void | Promise<void>;

/**
 * RPC method registration options
 */
export interface RpcMethodOptions {
  /** Optional validator for parameters */
  validate?: RpcValidator;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Typed API interface for RPC client
 * Converts method signatures to match JSON-RPC behavior
 */
export type RpcApi<T extends Record<string, (...args: any[]) => any>> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? R extends void
      ? (...params: P) => void // Notification (void return)
      : (...params: P) => Promise<Awaited<R>> // Regular method
    : never;
};

/**
 * Options for RPC client
 */
export interface RpcClientOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** API name exposed by preload (default: 'rpc') */
  apiName?: string;
}

/**
 * Options for exposing RPC API in preload
 */
export interface ExposeRpcApiOptions {
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, unknown>) => void;
  };
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => void;
  };
  /** Optional whitelist of methods to expose */
  methods?: string[];
  /** API name exposed to renderer (default: 'rpc') */
  apiName?: string;
}

/**
 * Stream chunk message for IPC
 */
export interface StreamChunk {
  streamId: string | number;
  type: "chunk" | "end" | "error";
  data?: unknown;
  error?: JsonRpcError;
}

/**
 * Stream request with stream flag
 */
export interface StreamRequest extends JsonRpcRequest {
  stream?: true;
}

/**
 * Stream handler - returns a ReadableStream
 */
export type StreamHandler = (...params: unknown[]) => ReadableStream;

/**
 * Stream method registration options
 */
export interface StreamMethodOptions extends RpcMethodOptions {
  /** Indicates this method returns a stream */
  stream?: true;
}

/**
 * Underlying source for ReadableStream
 */
export type UnderlyingSource<T> = {
  start?: (controller: ReadableStreamDefaultController<T>) => void | Promise<void>;
  pull?: (controller: ReadableStreamDefaultController<T>) => void | Promise<void>;
  cancel?: (reason?: unknown) => void | Promise<void>;
  type?: undefined;
};

/**
 * Event handler callback type
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Event subscriber information
 */
export interface EventSubscriber {
  windowId: number;
  eventName: string;
}

/**
 * Event bus API type
 * Maps event names to their data types
 */
export type EventBusEvents<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
};

/**
 * Typed event bus interface
 */
export type EventBus<T extends Record<string, unknown> = Record<string, unknown>> = {
  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends keyof T>(eventName: K, callback: EventHandler<T[K]>): () => void;

  /**
   * Unsubscribe from an event
   * If no callback is provided, removes all handlers for the event
   */
  off<K extends keyof T>(eventName: K, callback?: EventHandler<T[K]>): void;

  /**
   * Subscribe to an event once (auto-unsubscribe after first call)
   */
  once<K extends keyof T>(eventName: K, callback: EventHandler<T[K]>): void;

  /**
   * Get list of subscribed event names
   */
  getSubscribedEvents(): string[];
};

/**
 * RPC debug log entry type
 */
export interface RpcLogEntry {
  /** Log entry type */
  type: "request" | "response" | "error" | "notify" | "stream" | "event";
  /** RPC method or event name */
  method: string;
  /** Request parameters */
  params?: unknown[];
  /** Response result */
  result?: unknown;
  /** Error message */
  error?: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Duration in milliseconds (for responses/errors) */
  duration?: number;
  /** Request ID for correlating request/response */
  requestId?: string | number;
}

/**
 * RPC logger function type
 */
export type RpcLogger = (entry: RpcLogEntry) => void;

/**
 * Debug options for RPC clients
 */
export interface RpcDebugOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger function */
  logger?: RpcLogger;
}

/**
 * All types that can be serialized by Electron IPC using the Structured Clone Algorithm.
 *
 * Electron IPC internally uses structured clone, not JSON, which supports many more types.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
 * @see https://www.electronjs.org/docs/latest/tutorial/ipc#ipc-messages
 *
 * @example
 * ```typescript
 * import type { IpcSerializable } from 'electron-json-rpc/types';
 *
 * const data: IpcSerializable = new Date(); // OK
 * ```
 */
export type IpcSerializable =
  | string
  | number
  | boolean
  | bigint
  | undefined
  | null
  | Date
  | RegExp
  | { [key: string]: IpcSerializable }
  | IpcSerializable[]
  | ArrayBuffer
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | Map<IpcSerializable, IpcSerializable>
  | Set<IpcSerializable>
  | Error
  | EvalError
  | RangeError
  | ReferenceError
  | SyntaxError
  | TypeError
  | URIError;

/**
 * Primitive types supported by Electron IPC
 */
export type IpcPrimitive = string | number | boolean | bigint | undefined;
