# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

electron-json-rpc is a JSON-RPC 2.0 implementation for Electron with full TypeScript support. It provides type-safe IPC communication between main and renderer processes.

## Development Commands

```bash
# Build (compiles to dist/ using tsdown)
bun run build

# Development with watch mode
bun run dev

# Lint with oxlint
bun run lint

# Format code with oxfmt
bun run format

# Check formatting without modifying
bun run format:check
```

## Package Manager

**Bun** is the preferred package manager (used in `prepublishOnly` script). npm also works.

## Publishing

The project uses GitHub Actions with OIDC for secure npm publishing. Commits with `fix:` or `feat:` prefixes automatically trigger semantic-release to publish to npm.

## Architecture

The codebase is organized as separate modules, each with its own entry point:

### Main Process (`src/main.ts`)
- `RpcServer` class that registers RPC handlers and listens for IPC messages
- Methods: `register()`, `registerStream()`, `publish()`, `listen()`, `dispose()`
- Handles JSON-RPC 2.0 request/response protocol

### Preload Script (`src/preload.ts`)
- `exposeRpcApi()` - Exposes RPC to renderer via `contextBridge`
- Two modes: **Auto Proxy** (recommended, call any method directly) and **Whitelist** (only specific methods)
- Uses `ipcRenderer.send/invoke` for IPC communication

### Renderer Process (`src/renderer.ts`)
Multiple client creation functions:
- `createRpcClient()` - Basic untyped client
- `createTypedRpcClient<T>()` - Type-safe client from interface
- `defineRpcApi<T>()` - Semantic alias for typed client
- `createRpc()` - Fluent builder pattern with type inference
- `createEventBus<T>()` - Typed event subscription

### Supporting Modules
- **Stream** (`src/stream.ts`) - Web standard `ReadableStream` for server-sent streams
- **Event** (`src/event.ts`) - Pub-sub event system for main-to-renderer
- **Debug** (`src/debug.ts`) - Debug logging with custom logger support

## Build System (tsdown)

Build configuration is in `tsdown.config.ts`. Multiple entry points are defined:
- Each `src/*.ts` file builds to a separate `dist/*.js` module
- Exports in `package.json` map to these entry points (`./main`, `./preload`, etc.)
- Outputs ESM format with TypeScript declaration files (`.d.ts`)

## Type Safety Patterns

The library supports multiple type-safe API definition styles:

1. **Interface-based** - `createTypedRpcClient<MyInterface>()`
2. **Builder pattern** - `createRpc().add("method", () => ...).build()`
3. **Untyped** - `createRpcClient().call("method", ...)` for dynamic cases

## Key Concepts

- **Notifications**: Methods with `void` return type are one-way calls (no response)
- **Streaming**: Methods returning `ReadableStream` use `registerStream()` in main, `stream()` in renderer
- **Events**: Main publishes via `publish()`, renderer subscribes via `on()`/`off()`
- **Validation**: Generic `validate` option works with any validation library (Zod, TypeBox, Ajv, etc.)
