/**
 * JSON-RPC Client for Electron Renderer Process
 *
 * Re-exports all renderer modules for backward compatibility.
 */

// Basic client functionality
export { createRpcClient, createTypedRpcClient, useRpcProxy, defineRpcApi } from "./client.js";

// Builder pattern
export { createRpc } from "./builder.js";
export type { RpcBuilder, RpcBuilderMethods, RpcBuilderWithMethod } from "./builder.js";

// Event bus
export { createEventBus } from "./event.js";

// Re-export debug utilities
export { setRpcDebug, isRpcDebug, setRpcLogger } from "../debug.js";

// Re-export types
export type { RpcApi, RpcClientOptions } from "../types.js";
export type { EventBus, EventHandler, RpcLogger, RpcLogEntry } from "../types.js";
