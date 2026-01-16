/**
 * JSON-RPC Server for Electron Main Process
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  RpcHandler,
  RpcMethodOptions,
  RpcValidator,
  StreamHandler,
  StreamChunk,
} from "./types.js";
import { errors, errorToJsonRpc } from "./error.js";
import { generateStreamId, createStreamChunk, STREAM_CHANNEL } from "./stream.js";
import { EVENT_CHANNEL, type EventMessage } from "./event.js";

/**
 * Stored method with metadata
 */
interface StoredMethod {
  handler: RpcHandler;
  validate?: RpcValidator;
  description?: string;
  isStream?: boolean;
}

/**
 * Active stream state
 */
interface ActiveStream {
  streamId: string;
  sender: (channel: string, data: unknown) => void;
}

/**
 * IPC channel name for JSON-RPC communication
 */
const RPC_CHANNEL = "json-rpc";

const HEALTH_CHECK_METHOD = "__rpc_health__";

/**
 * JSON-RPC Server for Electron Main Process
 *
 * @example
 * ```typescript
 * import { app, BrowserWindow } from 'electron';
 * import { RpcServer } from 'electron-json-rpc/main';
 *
 * const rpc = new RpcServer();
 *
 * rpc.register('add', (a: number, b: number) => a + b);
 * rpc.register('fetchData', async (url: string) => {
 *   const response = await fetch(url);
 *   return response.json();
 * });
 * ```
 */
export class RpcServer {
  private readonly methods = new Map<string, StoredMethod>();
  private readonly streams = new Map<string, ActiveStream>();
  private readonly eventSubscribers = new Map<string, Set<number>>(); // eventName -> Set of window IDs
  private readonly handleMessageBound: (event: unknown, request: JsonRpcRequest) => void;
  private readonly handleStreamMessageBound: (event: unknown, chunk: StreamChunk) => void;
  private readonly handleEventBusMessageBound: (event: unknown, message: EventMessage) => void;
  private ipcMain: any;
  private webContents: any;
  private isListening = false;

  constructor(
    /**
     * Electron instance (for dependency injection in testing)
     * @internal
     */
    electron?: {
      ipcMain: any;
      webContents: any;
    },
  ) {
    // Electron is a peer dependency, we'll get it at runtime
    // Or use provided instance (for testing)
    try {
      const e =
        electron ||
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require("electron");
        })();
      this.ipcMain = e.ipcMain;
      this.webContents = e.webContents;
    } catch {
      throw new Error("Electron not found. Please install electron as a peer dependency.");
    }

    this.handleMessageBound = this.handleMessage.bind(this);
    this.handleStreamMessageBound = this.handleStreamMessage.bind(this);
    this.handleEventBusMessageBound = this.handleEventBusMessage.bind(this);

    if (!this.methods.has(HEALTH_CHECK_METHOD)) {
      this.register(HEALTH_CHECK_METHOD, () => true);
    }
  }

  /**
   * Register a RPC method
   * @param name - Method name
   * @param handler - Handler function
   * @param options - Optional validation and metadata
   */
  register(name: string, handler: RpcHandler, options?: RpcMethodOptions): void {
    this.methods.set(name, {
      handler,
      validate: options?.validate,
      description: options?.description,
    });
  }

  /**
   * Register a stream method that returns a ReadableStream
   * @param name - Method name
   * @param handler - Handler function that returns a ReadableStream
   * @param options - Optional validation and metadata
   *
   * @example
   * ```typescript
   * rpc.registerStream('dataStream', (count: number) => {
   *   return new ReadableStream({
   *     async start(controller) {
   *       for (let i = 0; i < count; i++) {
   *         controller.enqueue({ index: i, data: `chunk ${i}` });
   *         await new Promise(r => setTimeout(r, 100));
   *       }
   *       controller.close();
   *     }
   *   });
   * });
   * ```
   */
  registerStream(name: string, handler: StreamHandler, options?: RpcMethodOptions): void {
    this.methods.set(name, {
      handler: handler as RpcHandler,
      validate: options?.validate,
      description: options?.description,
      isStream: true,
    });
  }

  /**
   * Unregister a RPC method
   */
  unregister(name: string): void {
    this.methods.delete(name);
  }

  /**
   * Check if a method is registered
   */
  has(name: string): boolean {
    return this.methods.has(name);
  }

  /**
   * Get all registered method names
   */
  getMethodNames(): string[] {
    return Array.from(this.methods.keys());
  }

  /**
   * Start listening for IPC messages
   */
  listen(): void {
    if (this.isListening) {
      return;
    }

    this.ipcMain.on(RPC_CHANNEL, this.handleMessageBound);
    this.ipcMain.on(STREAM_CHANNEL, this.handleStreamMessageBound);
    this.ipcMain.on(EVENT_CHANNEL, this.handleEventBusMessageBound);
    this.isListening = true;
  }

  /**
   * Stop listening for IPC messages
   */
  dispose(): void {
    if (!this.isListening) {
      return;
    }

    this.ipcMain.removeListener(RPC_CHANNEL, this.handleMessageBound);
    this.ipcMain.removeListener(STREAM_CHANNEL, this.handleStreamMessageBound);
    this.ipcMain.removeListener(EVENT_CHANNEL, this.handleEventBusMessageBound);
    this.isListening = false;
    this.methods.clear();
    this.streams.clear();
    this.eventSubscribers.clear();
  }

  /**
   * Handle incoming IPC message
   */
  private async handleMessage(_event: unknown, request: JsonRpcRequest): Promise<void> {
    const sender = (_event as { sender?: { send: (channel: string, data: unknown) => void } })
      .sender;

    const response = await this.processRequest(request, sender);

    // Only send response for non-notifications (requests with id)
    if (request.id !== undefined && request.id !== null) {
      // Send response via the same event's reply method
      const event = _event as {
        reply?: (channel: string, data: unknown) => void;
      };
      event.reply?.(RPC_CHANNEL, response);
    }
  }

  /**
   * Handle stream-related messages from renderer
   */
  private handleStreamMessage(_event: unknown, chunk: StreamChunk): void {
    const { streamId, type } = chunk;

    if (type === "end" || type === "error") {
      // Clean up stream state
      this.streams.delete(String(streamId));
    }
  }

  /**
   * Process a single request and return response
   */
  private async processRequest(
    request: JsonRpcRequest,
    sender?: { send: (channel: string, data: unknown) => void },
  ): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    // Validate request
    if (!method || typeof method !== "string") {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: errors.invalidRequest(),
      };
    }

    // Check if method exists
    const storedMethod = this.methods.get(method);
    if (!storedMethod) {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: errors.methodNotFound(method),
      };
    }

    try {
      // Normalize params to array
      let args: unknown[];
      if (params === undefined) {
        args = [];
      } else if (Array.isArray(params)) {
        args = params;
      } else {
        // Named params - pass as single object
        args = [params];
      }

      // Run validator if provided
      if (storedMethod.validate) {
        try {
          await storedMethod.validate(args);
        } catch (validationError) {
          return {
            jsonrpc: "2.0",
            id: id ?? null,
            error: errors.invalidParams(
              validationError instanceof Error ? validationError.message : undefined,
            ),
          };
        }
      }

      // Handle stream methods
      if (storedMethod.isStream) {
        return this.handleStreamRequest(id, method, args, storedMethod, sender);
      }

      // Execute regular handler
      const result = await storedMethod.handler(...args);

      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: errorToJsonRpc(error),
      };
    }
  }

  /**
   * Handle a stream method request
   * Returns stream ID and starts streaming in background
   */
  private async handleStreamRequest(
    id: string | number | null | undefined,
    _method: string,
    args: unknown[],
    storedMethod: StoredMethod,
    sender?: { send: (channel: string, data: unknown) => void },
  ): Promise<JsonRpcResponse> {
    const streamId = generateStreamId();

    // Prefer responding to the requesting sender; fallback to all windows
    const sendChunk = sender
      ? (channel: string, data: unknown) => sender.send(channel, data)
      : (channel: string, data: unknown) => {
          const allWindows = this.webContents.getAllWebContents();
          for (const wc of allWindows) {
            wc.send(channel, data);
          }
        };

    this.streams.set(streamId, { streamId, sender: sendChunk });

    // Start streaming in background
    this.executeStreamHandler(streamId, storedMethod.handler, args, sendChunk).catch((error) => {
      const errorChunk = createStreamChunk(streamId, "error", errorToJsonRpc(error));
      sendChunk(STREAM_CHANNEL, errorChunk);
      this.streams.delete(streamId);
    });

    // Return stream ID immediately
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      result: { streamId },
    };
  }

  /**
   * Execute a stream handler and send chunks to renderer
   */
  private async executeStreamHandler(
    streamId: string,
    handler: RpcHandler,
    args: unknown[],
    sendChunk: (channel: string, data: unknown) => void,
  ): Promise<void> {
    const result = await handler(...args);

    if (result instanceof ReadableStream) {
      const reader = result.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = createStreamChunk(streamId, "chunk", value);
          sendChunk(STREAM_CHANNEL, chunk);
        }

        // Send end chunk
        const endChunk = createStreamChunk(streamId, "end");
        sendChunk(STREAM_CHANNEL, endChunk);
      } catch (error) {
        const errorChunk = createStreamChunk(streamId, "error", errorToJsonRpc(error));
        sendChunk(STREAM_CHANNEL, errorChunk);
      } finally {
        reader.releaseLock();
        this.streams.delete(streamId);
      }
    } else {
      // Non-stream result, send as single chunk and end
      const chunk = createStreamChunk(streamId, "chunk", result);
      sendChunk(STREAM_CHANNEL, chunk);

      const endChunk = createStreamChunk(streamId, "end");
      sendChunk(STREAM_CHANNEL, endChunk);

      this.streams.delete(streamId);
    }
  }

  /**
   * Handle event bus messages (subscribe/unsubscribe)
   */
  private handleEventBusMessage(_event: unknown, message: EventMessage): void {
    const { type, eventName } = message;
    const sender = (_event as { sender?: { id: number } }).sender;

    if (!sender) {
      return;
    }

    const windowId = sender.id;

    switch (type) {
      case "subscribe":
        this.subscribeToEvent(eventName, windowId);
        break;
      case "unsubscribe":
        this.unsubscribeFromEvent(eventName, windowId);
        break;
    }
  }

  /**
   * Subscribe a window to an event
   */
  private subscribeToEvent(eventName: string, windowId: number): void {
    if (!this.eventSubscribers.has(eventName)) {
      this.eventSubscribers.set(eventName, new Set());
    }
    this.eventSubscribers.get(eventName)!.add(windowId);
  }

  /**
   * Unsubscribe a window from an event
   */
  private unsubscribeFromEvent(eventName: string, windowId: number): void {
    const subscribers = this.eventSubscribers.get(eventName);
    if (subscribers) {
      subscribers.delete(windowId);
      if (subscribers.size === 0) {
        this.eventSubscribers.delete(eventName);
      }
    }
  }

  /**
   * Publish an event to all subscribed windows
   * @param eventName - The name of the event to publish
   * @param data - Optional data to send with the event
   *
   * @example
   * ```typescript
   * rpc.publish('user-updated', { id: '123', name: 'John' });
   * ```
   */
  publish(eventName: string, data?: unknown): void {
    const subscribers = this.eventSubscribers.get(eventName);
    if (!subscribers || subscribers.size === 0) {
      return; // No subscribers, nothing to do
    }

    const message: EventMessage = {
      type: "event",
      eventName,
      data,
    };

    // Send to all subscribed windows
    const allWindows = this.webContents.getAllWebContents();
    for (const wc of allWindows) {
      if (subscribers.has(wc.id)) {
        wc.send(EVENT_CHANNEL, message);
      }
    }
  }

  /**
   * Get current event subscribers
   * @returns Record mapping event names to subscriber counts
   *
   * @example
   * ```typescript
   * const subscribers = rpc.getEventSubscribers();
   * console.log(subscribers); // { 'user-updated': 2, 'data-changed': 1 }
   * ```
   */
  getEventSubscribers(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [eventName, subscribers] of this.eventSubscribers.entries()) {
      result[eventName] = subscribers.size;
    }
    return result;
  }
}

/**
 * Create a new RPC server instance
 */
export function createRpcServer(): RpcServer {
  return new RpcServer();
}
