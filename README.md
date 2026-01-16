# electron-json-rpc

[English](./README.md) | [简体中文](./README.zh-CN.md)

A type-safe IPC library for Electron built on the JSON-RPC 2.0 protocol. Define your API once, get full type inference across main process, preload script, and renderer process. Supports streaming, event bus, queued requests with retry, and validation.

> **Status**: This project is currently in **beta**. The API is subject to change. Feedback and contributions are welcome!

## Installation

```bash
bun add electron-json-rpc
# or
npm install electron-json-rpc
```

## Features

- **JSON-RPC 2.0 compliant** - Standard request/response protocol
- **Type-safe** - Full TypeScript support with typed method definitions
- **Event Bus** - Built-in publish-subscribe pattern for real-time events
- **Validation** - Generic validator interface compatible with any validation library
- **Streaming** - Web standard `ReadableStream` support for server-sent streams
- **Notifications** - One-way calls without response
- **Timeout handling** - Configurable timeout for RPC calls
- **Batch requests** - Support for multiple requests in a single call

## Quick Start

### Main Process

```typescript
import { app, BrowserWindow } from "electron";
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

// Register methods
rpc.register("add", (a: number, b: number) => a + b);
rpc.register("greet", async (name: string) => {
  return `Hello, ${name}!`;
});

// Start listening
rpc.listen();
```

### Preload Script

Two modes are supported: **Auto Proxy Mode** (recommended) and **Whitelist Mode**.

#### Auto Proxy Mode (Recommended)

No need to define method names - call any method registered in the main process directly:

```typescript
import { exposeRpcApi } from "electron-json-rpc/preload";
import { contextBridge, ipcRenderer } from "electron";

exposeRpcApi({
  contextBridge,
  ipcRenderer,
});
```

In the renderer process, you can call any method directly:

```typescript
// Call methods directly without pre-definition
const sum = await window.rpc.add(1, 2);
const greeting = await window.rpc.greet("World");

// Or use the generic call method
const result = await window.rpc.call("methodName", arg1, arg2);

// Send a notification (no response)
window.rpc.log("Hello from renderer!");
```

#### Whitelist Mode (More Secure)

Only expose specific methods:

```typescript
import { exposeRpcApi } from "electron-json-rpc/preload";
import { contextBridge, ipcRenderer } from "electron";

exposeRpcApi({
  contextBridge,
  ipcRenderer,
  methods: ["add", "greet"], // Only expose these methods
});
```

In the renderer process:

```typescript
// Whitelisted methods can be called directly
const sum = await window.rpc.add(1, 2);
const greeting = await window.rpc.greet("World");

// Non-whitelisted methods require the call method
const result = await window.rpc.call("otherMethod", arg1, arg2);
```

### Renderer Process

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient();

// Call a method
const result = await rpc.call("add", 1, 2);
console.log(result); // 3

// Send a notification (no response)
rpc.notify("log", "Hello from renderer!");
```

## Communication Modes

This library supports three main communication modes. Choose based on your security and type-safety requirements:

| Mode             | Preload Definition                                               | Renderer Usage                      | Security                    | Type-Safe | Use Case               |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------- | --------------------------- | --------: | ---------------------- |
| **Auto Proxy**   | `exposeRpcApi({ contextBridge, ipcRenderer })`                   | `await window.rpc.anyMethod()`      | ⚠️ Any method callable      |        No | Quick prototyping      |
| **Whitelist**    | `exposeRpcApi({ contextBridge, ipcRenderer, methods: ["add"] })` | `await window.rpc.add()`            | ✅ Only whitelisted methods |        No | Production recommended |
| **Typed Client** | Any mode                                                         | `const api = defineRpcApi<MyApi>()` | ✅ Depends on preload       |       Yes | Large projects         |

### Auto Proxy Mode (Simplest)

```typescript
// Preload - no method definitions needed
exposeRpcApi({ contextBridge, ipcRenderer });

// Renderer - call any method directly
await window.rpc.add(1, 2);
```

### Whitelist Mode (Production Recommended)

```typescript
// Preload - only expose specified methods
exposeRpcApi({ contextBridge, ipcRenderer, methods: ["add", "greet"] });

// Renderer - whitelisted methods called directly
await window.rpc.add(1, 2);
```

### Typed Client (Full Type Safety)

```typescript
// Renderer - define interface for full type safety
const api = defineRpcApi<{
  add: (a: number, b: number) => number;
  log: (msg: string) => void;
}>();

await api.add(1, 2); // Fully typed!
```

## Typed API

Define your API interface for full type safety:

```typescript
// Define your API types
type AppApi = {
  add: (a: number, b: number) => number;
  greet: (name: string) => Promise<string>;
  log: (message: string) => void; // notification
};

// Create typed client
import { createTypedRpcClient } from "electron-json-rpc/renderer";

const rpc = createTypedRpcClient<AppApi>();

// Fully typed!
const sum = await rpc.add(1, 2);
const greeting = await rpc.greet("World");
rpc.log("This is a notification");
```

### Interface-Style API (defineRpcApi)

For a more semantic API definition, use `defineRpcApi`:

```typescript
import { defineRpcApi } from "electron-json-rpc/renderer";

// Define your API interface
interface AppApi {
  getUserList(): Promise<{ id: string; name: string }[]>;
  getUser(id: string): Promise<{ id: string; name: string }>;
  deleteUser(id: string): Promise<void>;
  log(message: string): void; // notification
  dataStream(count: number): ReadableStream<number>;
}

const api = defineRpcApi<AppApi>({ timeout: 10000 });

// Fully typed usage
const users = await api.getUserList();
const user = await api.getUser("123");
await api.deleteUser("123");
api.log("Done"); // notification (void return)

// Stream support
for await (const n of api.dataStream(10)) {
  console.log(n);
}
```

### Builder Pattern (createRpc)

Build your API using a fluent builder pattern with type inference:

```typescript
import { createRpc } from "electron-json-rpc/renderer";

interface User {
  id: string;
  name: string;
}

const api = createRpc({ timeout: 10000 })
  .add("getUserList", () => Promise<User[]>())
  .add("getUser", (id: string) => Promise<User>())
  .add("deleteUser", (id: string) => Promise<void>())
  .add("log", (message: string) => {}) // void return = notification
  .stream("dataStream", (count: number) => new ReadableStream<number>())
  .build();

// Fully typed usage - types inferred from handler signatures
const users = await api.getUserList();
const user = await api.getUser("123");
await api.deleteUser("123");
api.log("Done"); // notification (void)

// Stream support
for await (const n of api.dataStream(10)) {
  console.log(n);
}
```

## Request Queue

For applications that need to handle unreliable connections or busy main processes, the queued RPC client provides automatic request queuing with retry logic.

### Basic Usage

```typescript
import { createQueuedRpcClient } from "electron-json-rpc/renderer";

const rpc = createQueuedRpcClient({
  maxSize: 50, // Maximum queue size
  fullBehavior: "evictOldest", // What to do when queue is full
  timeout: 10000, // Request timeout in ms
});

// Call a method - will be queued if main process is busy
const result = await rpc.call("getData", id);

// Send a notification (not queued - fire and forget)
rpc.notify("log", "Hello from renderer!");

// Get queue status
console.log(rpc.getQueueStatus());
// { pending: 2, active: 1, maxSize: 50, isPaused: false, isConnected: true }
```

### Queue Configuration

```typescript
const rpc = createQueuedRpcClient({
  // Queue size settings
  maxSize: 100,
  fullBehavior: "reject", // 'reject' | 'evict' | 'evictOldest'

  // Retry settings
  retry: {
    maxAttempts: 3, // Maximum retry attempts
    backoff: "exponential", // 'fixed' | 'exponential'
    initialDelay: 1000, // Initial delay in ms
    maxDelay: 10000, // Maximum delay in ms
  },

  // Connection health settings
  healthCheck: true, // Enable connection health check
  healthCheckInterval: 5000, // Health check interval in ms
});
```

### Queue Full Behavior

When the queue reaches maximum size:

- **`"reject"`** (default): Throw `RpcQueueFullError` for new requests
- **`"evict"`**: Evict the current request being added
- **`"evictOldest"`**: Remove the oldest request from the queue

```typescript
// Reject mode (default)
const rpc = createQueuedRpcClient({
  maxSize: 10,
  fullBehavior: "reject",
});

try {
  await rpc.call("someMethod");
} catch (error) {
  if (error.name === "RpcQueueFullError") {
    console.log("Queue is full!");
  }
}
```

### Queue Control Methods

```typescript
const rpc = createQueuedRpcClient();

// Check if queue is healthy (connected and not paused)
if (rpc.isQueueHealthy()) {
  await rpc.call("someMethod");
}

// Get detailed queue status
const status = rpc.getQueueStatus();
console.log(`Pending: ${status.pending}, Active: ${status.active}`);

// Pause queue processing (incoming requests will queue)
rpc.pauseQueue();

// Resume queue processing
rpc.resumeQueue();

// Clear all pending requests
rpc.clearQueue();
```

### Retry Strategy

The queue automatically retries failed requests based on the configured strategy:

```typescript
const rpc = createQueuedRpcClient({
  retry: {
    maxAttempts: 3,
    backoff: "exponential", // or "fixed"
    initialDelay: 1000,
    maxDelay: 10000,
  },
});

// Exponential backoff: 1000ms, 2000ms, 4000ms, ...
// Fixed backoff: 1000ms, 1000ms, 1000ms, ...
```

Requests are retried on:

- Timeout errors (`RpcTimeoutError`)
- Connection errors (`RpcConnectionError`)

### Error Handling

```typescript
import {
  RpcQueueFullError,
  RpcConnectionError,
  RpcQueueEvictedError,
  isQueueFullError,
  isConnectionError,
  isQueueEvictedError,
} from "electron-json-rpc/renderer";

const rpc = createQueuedRpcClient();

try {
  await rpc.call("someMethod");
} catch (error) {
  if (isQueueFullError(error)) {
    console.log(`Queue full: ${error.currentSize}/${error.maxSize}`);
  } else if (isConnectionError(error)) {
    console.log(`Connection lost: ${error.message}`);
  } else if (isQueueEvictedError(error)) {
    console.log(`Request evicted: ${error.reason}`);
  }
}
```

## Debug Logging

The renderer client provides built-in debug logging for monitoring RPC requests and responses. This is useful for development and troubleshooting.

### Global Debug Mode

Enable debug logging for all RPC clients globally:

```typescript
import { setRpcDebug, isRpcDebug } from "electron-json-rpc/renderer";

// Enable debug logging for all clients
setRpcDebug(true);

// Check if debug is enabled
if (isRpcDebug()) {
  console.log("Debug mode is active");
}

// Disable debug logging
setRpcDebug(false);
```

### Per-Client Debug Option

Enable debug logging for a specific client:

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient({
  debug: true, // Enable debug logging for this client
  timeout: 10000,
});

// Works with all client types
const api = createTypedRpcClient<MyApi>({ debug: true });
const events = createEventBus<AppEvents>({ debug: true });
```

### Custom Logger

Provide a custom logger function for full control over debug output:

```typescript
import { createRpcClient, type RpcLogger } from "electron-json-rpc/renderer";

const customLogger: RpcLogger = (entry) => {
  const { type, method, params, result, error, duration, requestId } = entry;

  console.log(`[RPC ${type.toUpperCase()}] ${method}`, {
    params,
    result,
    error,
    duration,
    requestId,
  });
};

const rpc = createRpcClient({
  logger: customLogger,
});
```

### Default Logger Output

When using the default logger (with `debug: true`), you'll see formatted console output:

```
[RPC] 10:30:15.123 → request add [#1]
  params: [1, 2]

[RPC] 10:30:15.145 ← response add [#1] (22ms)
  params: [1, 2]
  result: 3

[RPC] 10:30:16.234 → notify log
  params: ['Hello']

[RPC] 10:30:17.456 → request getUser [#2]
  params: ['123']

[RPC] 10:30:17.567 ← error getUser [#2] (111ms)
  params: ['123']
  error: Method not found
```

### Log Entry Types

The logger receives entries with the following types:

- **`request`** - Outgoing RPC request
- **`response`** - Successful RPC response
- **`error`** - Failed RPC request
- **`notify`** - One-way notification
- **`stream`** - Stream request
- **`event`** - Event bus event received

## Event Bus

The event bus enables real-time communication from the main process to renderer processes using a publish-subscribe pattern.

### Main Process

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();
rpc.listen();

// Publish events to all subscribed renderers
rpc.publish("user-updated", { id: "123", name: "John" });
rpc.publish("data-changed", { items: [1, 2, 3] });

// Check subscriber counts
console.log(rpc.getEventSubscribers());
// { "user-updated": 2, "data-changed": 1 }
```

### Renderer Process

```typescript
// Using the exposed API (via preload)
const unsubscribe = window.rpc.on("user-updated", (data) => {
  console.log("User updated:", data);
});

// Unsubscribe using the returned function
unsubscribe();

// Or unsubscribe manually
window.rpc.off("user-updated");

// Subscribe once (auto-unsubscribe after first event)
window.rpc.once("notification", (data) => {
  console.log("Got notification:", data);
});
```

### Typed Event Bus

For full type safety, use `createEventBus` with event definitions:

```typescript
import { createEventBus } from "electron-json-rpc/renderer";

// Define your events
interface AppEvents {
  "user-updated": { id: string; name: string };
  "data-changed": { items: number[] };
  notification: { message: string; type: "info" | "warning" };
}

const events = createEventBus<AppEvents>();

// Fully typed!
const unsubscribe = events.on("user-updated", (data) => {
  console.log(data.name); // TypeScript knows this is string
});

// Subscribe once
events.once("data-changed", (data) => {
  console.log(data.items); // number[]
});

// Unsubscribe
unsubscribe();
```

### Event Bus Methods

**Main Process (`RpcServer`):**

- `publish(eventName, data?)` - Publish an event to all subscribed renderers
- `getEventSubscribers()` - Get subscriber counts for each event

**Renderer Process:**

- `on(eventName, callback)` - Subscribe to an event, returns unsubscribe function
- `off(eventName, callback?)` - Unsubscribe from an event (or all callbacks for the event)
- `once(eventName, callback)` - Subscribe once, auto-unsubscribe after first event

## Streaming

Stream data from main process to renderer using Web standard `ReadableStream`:

### Main Process

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

// Register a stream method
rpc.registerStream("counter", async (count: number) => {
  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < count; i++) {
        controller.enqueue({ index: i, value: i * 2 });
        // Simulate async work
        await new Promise((r) => setTimeout(r, 100));
      }
      controller.close();
    },
  });
});

// Stream from fetch or other async source
rpc.registerStream("fetchData", async (url: string) => {
  const response = await fetch(url);
  return response.body!;
});

rpc.listen();
```

### Renderer Process

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient();

// Using for-await-of (recommended)
for await (const chunk of rpc.stream("counter", 10)) {
  console.log(chunk); // { index: 0, value: 0 }, { index: 1, value: 2 }, ...
}

// Using reader directly
const stream = rpc.stream("counter", 5);
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value);
}
reader.release();

// Pipe to Response
const response = new Response(rpc.stream("fetchData", "https://api.example.com/data"));
const blob = await response.blob();
```

### Stream Utilities

```typescript
import { asyncGeneratorToStream, iterableToStream } from "electron-json-rpc/stream";

// Convert async generator to stream
rpc.registerStream("numbers", () => {
  return asyncGeneratorToStream(async function* () {
    for (let i = 0; i < 10; i++) {
      yield i;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});

// Convert array/iterable to stream
rpc.registerStream("items", () => {
  return iterableToStream([1, 2, 3, 4, 5]);
});
```

## Validation

You can add parameter validation to any RPC method. The library provides a generic validator interface that works with any validation library.

### Custom Validator

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

// Simple custom validator
rpc.register("divide", (a: number, b: number) => a / b, {
  validate: (params) => {
    const [, divisor] = params as [number, number];
    if (divisor === 0) {
      throw new Error("Cannot divide by zero");
    }
  },
});
```

### With Zod

```typescript
import { z } from "zod";
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

const userSchema = z.object({
  name: z.string().min(1),
  age: z.number().min(0).max(150),
});

rpc.register(
  "createUser",
  async (user: unknown) => {
    // user is already validated
    return db.users.create(user);
  },
  {
    validate: (params) => {
      const result = userSchema.safeParse(params[0]);
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
    },
    description: "Create a new user",
  },
);
```

### With TypeBox

```typescript
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

const UserSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  age: Type.Number({ minimum: 0, maximum: 150 }),
});

type User = Static<typeof UserSchema>;

rpc.register(
  "createUser",
  async (user: User) => {
    return db.users.create(user);
  },
  {
    validate: (params) => {
      const errors = Value.Errors(UserSchema, params[0]);
      if (errors.length > 0) {
        throw new Error([...errors][0].message);
      }
    },
  },
);
```

### With Ajv

```typescript
import Ajv from "ajv";
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();
const ajv = new Ajv();

const validateUser = ajv.compile({
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    age: { type: "number", minimum: 0, maximum: 150 },
  },
  required: ["name", "age"],
  additionalProperties: false,
});

rpc.register(
  "createUser",
  async (user) => {
    return db.users.create(user);
  },
  {
    validate: (params) => {
      if (!validateUser(params[0])) {
        throw new Error(ajv.errorsText(validateUser.errors));
      }
    },
  },
);
```

## API Reference

### Main Process (`electron-json-rpc/main`)

#### `RpcServer`

```typescript
const rpc = new RpcServer();
```

**Methods:**

- `register(name: string, handler: Function, options?)` - Register a RPC method
  - `options.validate?: (params: unknown[]) => void | Promise<void>` - Validator function
  - `options.description?: string` - Method description
- `registerStream(name: string, handler: Function, options?)` - Register a stream method
  - Handler should return a `ReadableStream`
- `publish(eventName: string, data?)` - Publish an event to all subscribed renderers
- `getEventSubscribers(): Record<string, number>` - Get subscriber counts for each event
- `unregister(name: string)` - Unregister a method
- `has(name: string): boolean` - Check if method exists
- `getMethodNames(): string[]` - Get all registered method names
- `listen()` - Start listening for IPC messages
- `dispose()` - Stop listening and cleanup

### Preload (`electron-json-rpc/preload`)

#### `exposeRpcApi(options)`

Exposes the RPC API to the renderer process.

```typescript
exposeRpcApi({
  contextBridge,
  ipcRenderer,
  methods: ["method1", "method2"], // Optional whitelist
  apiName: "rpc", // Default: 'rpc'
});
```

#### `createPreloadClient(ipcRenderer, timeout?)`

Create a client for use in preload scripts (without exposing to renderer).

### Renderer (`electron-json-rpc/renderer`)

#### `createRpcClient(options?)`

Create an untyped RPC client.

```typescript
const rpc = createRpcClient({
  timeout: 10000, // Default: 30000ms
  apiName: "rpc", // Default: 'rpc'
});

await rpc.call("methodName", arg1, arg2);
rpc.notify("notificationMethod", arg1);
rpc.stream("streamMethod", arg1); // Returns ReadableStream
```

#### `createTypedRpcClient<T>(options?)`

Create a typed RPC client with full type safety.

```typescript
type MyApi = {
  foo: (x: number) => string;
};

const rpc = createTypedRpcClient<MyApi>();
await rpc.foo(42);
```

#### `defineRpcApi<T>(options?)`

Define a typed RPC API from an interface (alias for `createTypedRpcClient` with semantic naming).

```typescript
interface AppApi {
  getUser(id: string): Promise<User>;
  log(msg: string): void;
}

const api = defineRpcApi<AppApi>();
await api.getUser("123");
api.log("hello");
```

#### `createRpc(options?)`

Create a fluent API builder with type inference.

```typescript
const api = createRpc()
  .add("getUser", (id: string) => Promise<User>())
  .add("log", (msg: string) => {})
  .stream("dataStream", (n: number) => new ReadableStream<number>())
  .build();

await api.getUser("123");
api.log("hello");
```

#### `useRpcProxy(options?)`

Use the proxy exposed by preload (if methods whitelist was provided).

#### `createQueuedRpcClient(options?)`

Create a queued RPC client with automatic retry and connection health checking.

```typescript
const rpc = createQueuedRpcClient({
  maxSize: 100, // Maximum queue size (default: 100)
  fullBehavior: "reject", // 'reject' | 'evict' | 'evictOldest'
  timeout: 30000, // Request timeout in ms (default: 30000)
  retry: {
    maxAttempts: 3, // Maximum retry attempts (default: 3)
    backoff: "exponential", // 'fixed' | 'exponential'
    initialDelay: 1000, // Initial delay in ms (default: 1000)
    maxDelay: 10000, // Maximum delay in ms (default: 10000)
  },
  healthCheck: true, // Enable health check (default: true)
  healthCheckInterval: 5000, // Health check interval in ms (default: 5000)
  apiName: "rpc", // API name (default: 'rpc')
});

// Queue control methods
rpc.getQueueStatus(); // Returns QueueStatus
rpc.clearQueue(); // Clear all pending requests
rpc.pauseQueue(); // Pause queue processing
rpc.resumeQueue(); // Resume queue processing
rpc.isQueueHealthy(); // Returns true if connected and not paused
```

#### `createEventBus<T>(options?)`

Create a typed event bus for real-time events from main process.

```typescript
interface AppEvents {
  "user-updated": { id: string; name: string };
  "data-changed": { items: number[] };
}

const events = createEventBus<AppEvents>();

// Subscribe with full type safety
const unsubscribe = events.on("user-updated", (data) => {
  console.log(data.name); // TypeScript knows this is string
});

// Unsubscribe
unsubscribe();

// Subscribe once
events.once("data-changed", (data) => {
  console.log(data.items);
});
```

## Error Handling

JSON-RPC errors are returned with standard error codes:

| Code   | Message          |
| ------ | ---------------- |
| -32700 | Parse error      |
| -32600 | Invalid Request  |
| -32601 | Method not found |
| -32602 | Invalid params   |
| -32603 | Internal error   |

Timeout errors use a custom `RpcTimeoutError` class.

## Bundle Size

ESM bundles:

| Package          | gzip    |
| ---------------- | ------- |
| Preload          | 3.95 kB |
| Main             | 2.97 kB |
| Queue            | 1.99 kB |
| Debug            | 1.50 kB |
| Renderer/client  | 1.14 kB |
| Renderer/builder | 1.21 kB |
| Renderer/event   | 1.15 kB |
| Renderer/queue   | 0.93 kB |
| Stream           | 0.72 kB |
| Event            | 0.43 kB |

## Requirements

- **Electron**: >= 18.0.0 (recommended >= 32.0.0)
- **Node.js**: >= 16.9.0
- **TypeScript**: >= 5.0.0 (if using TypeScript)

## License

MIT
