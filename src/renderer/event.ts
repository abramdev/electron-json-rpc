/**
 * Typed Event Bus for Electron Renderer Process
 *
 * Provides type-safe event subscription with full type inference.
 */

import type { EventBus, EventHandler, RpcDebugOptions } from "../types.js";
import { isDebugEnabled, getLogger, createDebugTracker } from "../debug.js";
import { DEFAULT_API_NAME, getExposedApi } from "./internal.js";

/**
 * Create a typed event bus for renderer process
 *
 * Provides type-safe event subscription with full type inference.
 *
 * @param options - Client options
 * @returns Typed event bus
 */
export function createEventBus<T extends Record<string, unknown> = Record<string, unknown>>(
  options: { apiName?: string } & RpcDebugOptions = {},
): EventBus<T> {
  const { apiName = DEFAULT_API_NAME, debug, logger } = options;
  const api = getExposedApi(apiName);

  if (!api) {
    throw new Error(
      `RPC API not found. Make sure exposeRpcApi() is called in your preload script with apiName='${apiName}'.`,
    );
  }

  // Check if the API has event methods
  if (typeof api.on !== "function") {
    throw new Error(
      "Event bus methods not available. Make sure you're using a version of electron-json-rpc/preload that supports events.",
    );
  }

  const enabled = isDebugEnabled(debug);
  const debugTracker = createDebugTracker(enabled, logger ?? getLogger());
  const subscribedEvents = new Set<string>();
  const handlerRegistry = new Map<string, Set<EventHandler<unknown>>>();
  const wrappedHandlers = new Map<string, Map<EventHandler<unknown>, (data: unknown) => void>>();

  const registerHandler = (eventName: string, handler: EventHandler<unknown>): void => {
    let handlers = handlerRegistry.get(eventName);
    if (!handlers) {
      handlers = new Set();
      handlerRegistry.set(eventName, handlers);
    }
    handlers.add(handler);
    subscribedEvents.add(eventName);
  };

  const unregisterHandler = (eventName: string, handler?: EventHandler<unknown>): void => {
    const handlers = handlerRegistry.get(eventName);
    if (!handlers) {
      return;
    }

    if (handler) {
      handlers.delete(handler);
      wrappedHandlers.get(eventName)?.delete(handler);
    } else {
      handlers.clear();
      handlerRegistry.delete(eventName);
      wrappedHandlers.delete(eventName);
    }

    if (handlers.size === 0) {
      handlerRegistry.delete(eventName);
      wrappedHandlers.delete(eventName);
      subscribedEvents.delete(eventName);
    }
  };

  const getWrappedHandler = (
    eventName: string,
    handler: EventHandler<unknown>,
  ): ((data: unknown) => void) => {
    if (!enabled) {
      return handler as (data: unknown) => void;
    }

    let eventHandlers = wrappedHandlers.get(eventName);
    if (!eventHandlers) {
      eventHandlers = new Map();
      wrappedHandlers.set(eventName, eventHandlers);
    }

    const existing = eventHandlers.get(handler);
    if (existing) {
      return existing;
    }

    const wrapped = (data: unknown) => {
      debugTracker.onEvent(String(eventName), data);
      return handler(data);
    };

    eventHandlers.set(handler, wrapped);
    return wrapped;
  };

  return {
    on: (eventName, callback) => {
      const name = String(eventName);
      const handler = callback as EventHandler<unknown>;
      const wrappedHandler = getWrappedHandler(name, handler);

      registerHandler(name, handler);

      const unsubscribe = api.on!(name, wrappedHandler);
      return () => {
        unsubscribe();
        unregisterHandler(name, handler);
      };
    },

    off: (eventName, callback) => {
      const name = String(eventName);

      if (callback) {
        const handler = callback as EventHandler<unknown>;
        const wrappedHandler = wrappedHandlers.get(name)?.get(handler) ?? handler;
        api.off!(name, wrappedHandler as (data?: unknown) => void);
        unregisterHandler(name, handler);
      } else {
        api.off!(name);
        unregisterHandler(name);
      }
    },

    once: (eventName, callback) => {
      const name = String(eventName);
      const handler = callback as EventHandler<unknown>;

      registerHandler(name, handler);

      const wrappedHandler = (data: unknown) => {
        if (enabled) {
          debugTracker.onEvent(name, data);
        }
        try {
          handler(data);
        } finally {
          unregisterHandler(name, handler);
        }
      };

      if (enabled) {
        let eventHandlers = wrappedHandlers.get(name);
        if (!eventHandlers) {
          eventHandlers = new Map();
          wrappedHandlers.set(name, eventHandlers);
        }
        eventHandlers.set(handler, wrappedHandler);
      }

      api.once!(name, wrappedHandler);
    },

    getSubscribedEvents: () => Array.from(subscribedEvents),
  };
}

/**
 * Re-export types for convenience
 */
export type { EventBus, EventHandler } from "../types.js";
