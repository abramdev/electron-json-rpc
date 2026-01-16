/**
 * JSON-RPC Preload Script for Electron
 *
 * Exposes a secure RPC API to the renderer process via contextBridge
 *
 * Architecture:
 * - Regular RPC calls go directly from renderer to main (no preload overhead)
 * - Streams and events are handled in preload (require state management)
 */

import type { ExposeRpcApiOptions, EventHandler } from "./types.js";
import { STREAM_CHANNEL, createStreamChunk } from "./stream.js";
import { EVENT_CHANNEL, type EventMessage } from "./event.js";

/**
 * 订阅指定事件到主进程
 */
function subscribeToEvent(
  ipcRenderer: ExposeRpcApiOptions["ipcRenderer"],
  eventName: string,
): void {
  ipcRenderer.send(EVENT_CHANNEL, {
    type: "subscribe",
    eventName,
  } as EventMessage);
}

/**
 * 取消订阅指定事件
 */
function unsubscribeFromEvent(
  ipcRenderer: ExposeRpcApiOptions["ipcRenderer"],
  eventName: string,
): void {
  ipcRenderer.send(EVENT_CHANNEL, {
    type: "unsubscribe",
    eventName,
  } as EventMessage);
}

/**
 * IPC channel name for JSON-RPC communication
 */
const RPC_CHANNEL = "json-rpc";

/**
 * Module-level state (not exposed to renderer, so can contain unclonable objects)
 */
const state = {
  /** Event handlers by event name (for exposed API and preload client) */
  eventHandlers: new Map<string, Set<EventHandler>>(),
  /** Active stream controllers */
  activeStreams: new Map<string, ReadableStreamDefaultController>(),

  /** The ipcRenderer instance (set during setup) */
  ipcRenderer: null as ExposeRpcApiOptions["ipcRenderer"] | null,
  /** Request ID counter */
  requestIdCounter: 0,
};

/**
 * Setup IPC listeners for streams and events (only these need preload state)
 */
function setupListeners(ipcRenderer: ExposeRpcApiOptions["ipcRenderer"]): void {
  // Listen for stream chunks
  ipcRenderer.on(STREAM_CHANNEL, handleStreamChunk as (event: unknown, ...args: unknown[]) => void);
  // Listen for event bus messages from main process
  ipcRenderer.on(
    EVENT_CHANNEL,
    handleEventBusMessage as (event: unknown, ...args: unknown[]) => void,
  );
}

/**
 * Handle incoming stream chunks
 */
function handleStreamChunk(_event: unknown, ...args: unknown[]): void {
  const chunk = args[0] as {
    streamId: string | number;
    type: "chunk" | "end" | "error";
    data?: unknown;
    error?: { message?: string };
  };
  const { streamId, type, data, error } = chunk;
  const streamKey = String(streamId);
  const controller = state.activeStreams.get(streamKey);

  if (!controller) {
    return; // Stream not found or already closed
  }

  switch (type) {
    case "chunk":
      controller.enqueue(data);
      break;
    case "end":
      state.activeStreams.delete(streamKey);
      controller.close();
      break;
    case "error":
      state.activeStreams.delete(streamKey);
      const errorObj = new Error(error?.message ?? "Stream error");
      controller.error(errorObj);
      break;
  }
}

/**
 * Handle incoming event bus messages from main
 */
function handleEventBusMessage(_event: unknown, ...args: unknown[]): void {
  const message = args[0] as { type: string; eventName: string; data?: unknown };
  const { type, eventName, data } = message;

  if (type === "event") {
    // Handle callbacks from createPreloadClient and exposed API
    const handlers = state.eventHandlers.get(eventName);
    if (handlers) {
      for (const callback of handlers) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for "${eventName}":`, error);
        }
      }
    }
  }
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `rpc_${++state.requestIdCounter}_${Date.now()}`;
}

/**
 * Create the API object to expose to renderer
 *
 * The API object functions only capture primitive values and use ipcRenderer
 * which is available in renderer, making the object clonable by contextBridge.
 */
function createApiObject(ipcRenderer: ExposeRpcApiOptions["ipcRenderer"]): Record<string, unknown> {
  return {
    /**
     * Call a RPC method - direct IPC to main, no preload overhead
     */
    call: (method: string, ...params: unknown[]) => {
      const id = generateRequestId();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ipcRenderer.removeListener(RPC_CHANNEL, listener);
          reject(new Error(`RPC timeout: ${method}`));
        }, 30000);

        const listener = (_event: unknown, ...args: unknown[]) => {
          const response = args[0] as {
            jsonrpc: "2.0";
            id: string | number;
            result?: unknown;
            error?: unknown;
          };
          if (response.id === id) {
            clearTimeout(timeout);
            ipcRenderer.removeListener(RPC_CHANNEL, listener);
            if (response.error) {
              const err = response.error as { message: string };
              reject(new Error(err.message));
            } else {
              resolve(response.result);
            }
          }
        };

        ipcRenderer.on(RPC_CHANNEL, listener);
        ipcRenderer.send(RPC_CHANNEL, { jsonrpc: "2.0", id, method, params });
      });
    },

    /**
     * Send a notification (one-way, no response) - direct IPC
     */
    notify: (method: string, ...params: unknown[]) => {
      ipcRenderer.send(RPC_CHANNEL, { jsonrpc: "2.0", method, params });
    },

    /**
     * Create a stream from a RPC method
     * Stream setup uses delegation, but chunks go direct via STREAM_CHANNEL
     */
    stream: (method: string, ...params: unknown[]) => {
      const callId = generateRequestId();
      const ipc = state.ipcRenderer || ipcRenderer;
      let streamKey: string | null = null;

      return new ReadableStream({
        start: async (controller) => {
          try {
            // First call the method to get stream ID
            const streamId = await new Promise<string>((resolve, reject) => {
              const timeout = setTimeout(() => {
                ipc.removeListener(RPC_CHANNEL, listener);
                reject(new Error("Stream timeout"));
              }, 30000);

              const listener = (_event: unknown, ...args: unknown[]) => {
                const response = args[0] as {
                  jsonrpc: "2.0";
                  id: string;
                  result?: { streamId?: string };
                };
                if (response.id === callId) {
                  clearTimeout(timeout);
                  ipc.removeListener(RPC_CHANNEL, listener);
                  if (response.result?.streamId) {
                    resolve(response.result.streamId);
                  } else {
                    reject(new Error("Not a stream method"));
                  }
                }
              };

              ipc.on(RPC_CHANNEL, listener);
              ipc.send(RPC_CHANNEL, { jsonrpc: "2.0", id: callId, method, params });
            });

            // Store controller for this stream
            streamKey = String(streamId);
            state.activeStreams.set(streamKey, controller);

            // Set up cleanup when stream closes
            const originalClose = controller.close.bind(controller);
            controller.close = () => {
              state.activeStreams.delete(streamKey!);
              originalClose();
            };
          } catch (error) {
            controller.error(error);
          }
        },
        cancel: () => {
          if (streamKey) {
            state.activeStreams.delete(streamKey);
            ipc.send(STREAM_CHANNEL, createStreamChunk(streamKey, "end"));
          }
        },
      });
    },

    /**
     * Subscribe to an event
     * @returns Unsubscribe function
     */
    on: (eventName: string, callback: (data?: unknown) => void) => {
      const ipc = state.ipcRenderer || ipcRenderer;

      if (!state.eventHandlers.has(eventName)) {
        state.eventHandlers.set(eventName, new Set());
        subscribeToEvent(ipc, eventName);
      }

      state.eventHandlers.get(eventName)!.add(callback as EventHandler);

      // Return unsubscribe function
      return () => {
        const handlers = state.eventHandlers.get(eventName);
        if (handlers) {
          handlers.delete(callback as EventHandler);
          if (handlers.size === 0) {
            state.eventHandlers.delete(eventName);
            unsubscribeFromEvent(ipc, eventName);
          }
        }
      };
    },

    /**
     * Unsubscribe from an event
     */
    off: (eventName: string, callback?: (data?: unknown) => void) => {
      const ipc = state.ipcRenderer || ipcRenderer;
      const handlers = state.eventHandlers.get(eventName);
      if (!handlers) {
        return;
      }

      if (callback) {
        handlers.delete(callback as EventHandler);
        if (handlers.size === 0) {
          state.eventHandlers.delete(eventName);
          unsubscribeFromEvent(ipc, eventName);
        }
      } else {
        state.eventHandlers.delete(eventName);
        unsubscribeFromEvent(ipc, eventName);
      }
    },

    /**
     * Subscribe to an event once (auto-unsubscribe after first call)
     */
    once: (eventName: string, callback: (data?: unknown) => void) => {
      const ipc = state.ipcRenderer || ipcRenderer;

      const wrappedCallback: EventHandler = (data) => {
        try {
          callback(data);
        } finally {
          const handlers = state.eventHandlers.get(eventName);
          if (handlers) {
            handlers.delete(wrappedCallback);
            if (handlers.size === 0) {
              state.eventHandlers.delete(eventName);
              unsubscribeFromEvent(ipc, eventName);
            }
          }
        }
      };

      if (!state.eventHandlers.has(eventName)) {
        state.eventHandlers.set(eventName, new Set());
        subscribeToEvent(ipc, eventName);
      }

      state.eventHandlers.get(eventName)!.add(wrappedCallback);
    },
  };
}

/**
 * Create the API object for whitelist mode
 * Adds shortcut methods for whitelisted method names
 */
function createWhitelistApi(
  methods: string[],
  ipcRenderer: ExposeRpcApiOptions["ipcRenderer"],
): Record<string, unknown> {
  const api = createApiObject(ipcRenderer);

  // Add method shortcuts for whitelisted methods
  for (const method of methods) {
    Object.defineProperty(api, method, {
      value: (...args: unknown[]) => {
        const callFn = api.call as (method: string, ...params: unknown[]) => Promise<unknown>;
        return callFn(method, ...args);
      },
      writable: false,
      enumerable: true,
    });
  }

  return api;
}

/**
 * Initialize the preload module
 */
function init(ipcRenderer: ExposeRpcApiOptions["ipcRenderer"]): void {
  if (state.ipcRenderer) {
    return; // Already initialized
  }

  state.ipcRenderer = ipcRenderer;
  setupListeners(ipcRenderer);
}

/**
 * Expose an RPC API to the renderer process via contextBridge
 */
export function exposeRpcApi(options: ExposeRpcApiOptions): void {
  const { contextBridge, ipcRenderer, methods, apiName = "rpc" } = options;

  // Initialize the module-level state
  init(ipcRenderer);

  // Build the API object to expose
  const api =
    methods && methods.length > 0
      ? createWhitelistApi(methods, ipcRenderer)
      : createApiObject(ipcRenderer);

  // Expose to renderer via contextBridge
  contextBridge.exposeInMainWorld(apiName, api);
}

/**
 * Create an RPC client for use in preload scripts
 * (without exposing to renderer)
 */
export function createPreloadClient(
  ipcRenderer: ExposeRpcApiOptions["ipcRenderer"],
  timeout = 30000,
): {
  call: (method: string, ...params: unknown[]) => Promise<unknown>;
  notify: (method: string, ...params: unknown[]) => void;
  stream: (method: string, ...params: unknown[]) => ReadableStream;
  on: (eventName: string, callback: (data?: unknown) => void) => () => void;
  off: (eventName: string, callback?: (data?: unknown) => void) => void;
  once: (eventName: string, callback: (data?: unknown) => void) => void;
  dispose: () => void;
} {
  // Initialize the module-level state
  init(ipcRenderer);

  return {
    call: (method: string, ...params: unknown[]) => {
      const id = generateRequestId();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          ipcRenderer.removeListener(RPC_CHANNEL, listener);
          reject(new Error(`RPC timeout: ${method}`));
        }, timeout);

        const listener = (_event: unknown, ...args: unknown[]) => {
          const response = args[0] as {
            jsonrpc: "2.0";
            id: string | number;
            result?: unknown;
            error?: unknown;
          };
          if (response.id === id) {
            clearTimeout(timeoutId);
            ipcRenderer.removeListener(RPC_CHANNEL, listener);
            if (response.error) {
              const err = response.error as { message: string };
              reject(new Error(err.message));
            } else {
              resolve(response.result);
            }
          }
        };

        ipcRenderer.on(RPC_CHANNEL, listener);
        ipcRenderer.send(RPC_CHANNEL, { jsonrpc: "2.0", id, method, params });
      });
    },

    notify: (method: string, ...params: unknown[]) => {
      ipcRenderer.send(RPC_CHANNEL, { jsonrpc: "2.0", method, params });
    },

    stream: (method: string, ...params: unknown[]) => {
      const callId = generateRequestId();
      let streamKey: string | null = null;

      return new ReadableStream({
        start: async (controller) => {
          try {
            // First call the method to get stream ID
            const streamId = await new Promise<string>((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                ipcRenderer.removeListener(RPC_CHANNEL, listener);
                reject(new Error("Stream timeout"));
              }, timeout);

              const listener = (_event: unknown, ...args: unknown[]) => {
                const response = args[0] as {
                  jsonrpc: "2.0";
                  id: string;
                  result?: { streamId?: string };
                };
                if (response.id === callId) {
                  clearTimeout(timeoutId);
                  ipcRenderer.removeListener(RPC_CHANNEL, listener);
                  if (response.result?.streamId) {
                    resolve(response.result.streamId);
                  } else {
                    reject(new Error("Not a stream method"));
                  }
                }
              };

              ipcRenderer.on(RPC_CHANNEL, listener);
              ipcRenderer.send(RPC_CHANNEL, { jsonrpc: "2.0", id: callId, method, params });
            });

            // Store controller for this stream
            streamKey = String(streamId);
            state.activeStreams.set(streamKey, controller);

            // Set up cleanup when stream closes
            const originalClose = controller.close.bind(controller);
            controller.close = () => {
              state.activeStreams.delete(streamKey!);
              originalClose();
            };
          } catch (error) {
            controller.error(error);
          }
        },
        cancel: () => {
          if (streamKey) {
            state.activeStreams.delete(streamKey);
            ipcRenderer.send(STREAM_CHANNEL, createStreamChunk(streamKey, "end"));
          }
        },
      });
    },

    on: (eventName: string, callback: EventHandler) => {
      if (!state.eventHandlers.has(eventName)) {
        state.eventHandlers.set(eventName, new Set());
        // Send subscribe message to main process
        subscribeToEvent(ipcRenderer, eventName);
      }

      state.eventHandlers.get(eventName)!.add(callback);

      // Return unsubscribe function
      return () => {
        const handlers = state.eventHandlers.get(eventName);
        if (handlers) {
          handlers.delete(callback);
          if (handlers.size === 0) {
            state.eventHandlers.delete(eventName);
            unsubscribeFromEvent(ipcRenderer, eventName);
          }
        }
      };
    },

    off: (eventName: string, callback?: EventHandler) => {
      const handlers = state.eventHandlers.get(eventName);
      if (!handlers) {
        return;
      }

      if (callback) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          state.eventHandlers.delete(eventName);
          unsubscribeFromEvent(ipcRenderer, eventName);
        }
      } else {
        state.eventHandlers.delete(eventName);
        unsubscribeFromEvent(ipcRenderer, eventName);
      }
    },

    once: (eventName: string, callback: EventHandler) => {
      const wrappedCallback: EventHandler = (data) => {
        callback(data);
        const handlers = state.eventHandlers.get(eventName);
        if (handlers) {
          handlers.delete(wrappedCallback);
          if (handlers.size === 0) {
            state.eventHandlers.delete(eventName);
            unsubscribeFromEvent(ipcRenderer, eventName);
          }
        }
      };

      if (!state.eventHandlers.has(eventName)) {
        state.eventHandlers.set(eventName, new Set());
        subscribeToEvent(ipcRenderer, eventName);
      }

      state.eventHandlers.get(eventName)!.add(wrappedCallback);
    },

    dispose: () => {
      ipcRenderer.removeListener(STREAM_CHANNEL, handleStreamChunk as (...args: unknown[]) => void);
      ipcRenderer.removeListener(
        EVENT_CHANNEL,
        handleEventBusMessage as (...args: unknown[]) => void,
      );

      // Close all active streams
      for (const controller of state.activeStreams.values()) {
        try {
          controller.close();
        } catch {
          // Ignore errors during cleanup
        }
      }
      state.activeStreams.clear();

      // Clear all event handlers
      state.eventHandlers.clear();
    },
  };
}
