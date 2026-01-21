# electron-json-rpc

[English](./README.md) | [简体中文](./README.zh-CN.md)

基于 JSON-RPC 2.0 协议的 Electron 类型安全 IPC 通信库。定义一次 API，即可在主进程、preload 脚本和渲染进程中获得完整的类型推断。支持流式传输、事件总线、参数验证和可配置的超时处理。

> **状态**: 本项目目前处于 **beta** 阶段。API 可能会发生变化。欢迎反馈和贡献！

## 安装

```bash
bun add electron-json-rpc
# 或
npm install electron-json-rpc
```

## 特性

- **符合 JSON-RPC 2.0 标准** - 标准的请求/响应协议
- **类型安全** - 完整的 TypeScript 支持，支持类型化方法定义
- **事件总线** - 内置发布-订阅模式，支持实时事件
- **参数验证** - 通用验证器接口，兼容任何验证库
- **流式传输** - 支持 Web 标准 `ReadableStream` 的服务端推送流
- **通知 Notification** - 支持 JSON-RPC 2.0 通知，无需响应的单向调用
- **超时处理** - 可配置的 RPC 调用超时

## 快速开始

### 主进程

```typescript
import { app, BrowserWindow } from "electron";
import { RpcServer, createRpcServer } from "electron-json-rpc/main";

// 方式 1：使用类构造函数
const rpc = new RpcServer();

// 方式 2：使用工厂函数（等效）
const rpc = createRpcServer();

// 注册方法
rpc.register("add", (a: number, b: number) => a + b);
rpc.register("greet", async (name: string) => {
  return `你好，${name}！`;
});

// 开始监听
rpc.listen();
```

### Preload 脚本

现在支持两种模式：**自动代理模式**（推荐）和**白名单模式**。

#### 自动代理模式（推荐）

无需定义方法名，直接调用主进程注册的任何方法：

```typescript
import { exposeRpcApi } from "electron-json-rpc/preload";
import { contextBridge, ipcRenderer } from "electron";

exposeRpcApi({
  contextBridge,
  ipcRenderer,
});
```

在渲染进程中可以直接调用任何方法：

```typescript
// 直接调用，无需预定义
const sum = await window.rpc.add(1, 2);
const greeting = await window.rpc.greet("世界");

// 也可以使用通用 call 方法
const result = await window.rpc.call("methodName", arg1, arg2);

// 发送通知（无需响应）
window.rpc.log("来自渲染进程的问候！");
```

#### 白名单模式（安全性更高）

只暴露指定的方法：

```typescript
import { exposeRpcApi } from "electron-json-rpc/preload";
import { contextBridge, ipcRenderer } from "electron";

exposeRpcApi({
  contextBridge,
  ipcRenderer,
  methods: ["add", "greet"], // 只暴露这些方法
});
```

在渲染进程中：

```typescript
// 白名单方法可以直接调用
const sum = await window.rpc.add(1, 2);
const greeting = await window.rpc.greet("世界");

// 非白名单方法需要使用 call 方法
const result = await window.rpc.call("otherMethod", arg1, arg2);
```

#### 使用代理模式

如果需要类型推断的类型化代理：

```typescript
import { exposeRpcApi } from "electron-json-rpc/preload";
import { contextBridge, ipcRenderer } from "electron";

exposeRpcApi({
  contextBridge,
  ipcRenderer,
  methods: ["add", "greet"],
});

// 在渲染进程中，也可以使用 proxy 进行类型推断
const api = window.rpc?.proxy<{
  add: (a: number, b: number) => number;
  greet: (name: string) => string;
}>();
```

### 渲染进程

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient();

// 调用方法
const result = await rpc.call("add", 1, 2);
console.log(result); // 3

// 发送通知（无需响应）
rpc.notify("log", "来自渲染进程的问候！");
```

## 可序列化类型

本库使用 Electron IPC，内部使用**结构化克隆算法**（Structured Clone Algorithm）进行序列化。这意味着你可以传递比 JSON 更多的类型：

| 类型                                         | 支持 | 说明                                          |
| -------------------------------------------- | ---- | --------------------------------------------- |
| 基本类型                                     | ✅   | string、number、boolean、bigint               |
| null / undefined                             | ✅   | undefined 会保留（不会像 JSON 那样变成 null） |
| 普通对象                                     | ✅   | 包含可序列化属性的对象                        |
| 数组                                         | ✅   | 包括嵌套数组和稀疏数组                        |
| Date                                         | ✅   | 保留 Date 对象                                |
| RegExp                                       | ✅   | 保留正则表达式和标志                          |
| Map / Set                                    | ✅   | 内容可序列化的 Map 和 Set                     |
| ArrayBuffer                                  | ✅   | 二进制数据                                    |
| Typed Arrays                                 | ✅   | Int8Array、Uint8Array 等                      |
| Error 对象                                   | ✅   | 包括堆栈信息                                  |
| 循环引用                                     | ✅   | 可以正确处理                                  |
| 函数                                         | ❌   | -                                             |
| 类实例（除内置类型如 Date、Map、Set、Error） | ❌   | -                                             |
| Symbol                                       | ❌   | -                                             |

### 示例

```typescript
// 主进程
rpc.register("getData", () => ({
  date: new Date(),
  regex: /test/gi,
  map: new Map([["key", "value"]]),
  buffer: new ArrayBuffer(8),
}));

// 渲染进程 - 所有类型都正确保留！
const data = await rpc.getData();
console.log(data.date instanceof Date); // true
console.log(data.regex instanceof RegExp); // true
console.log(data.map instanceof Map); // true
console.log(data.buffer instanceof ArrayBuffer); // true
```

### TypeScript 类型

你可以使用 `IpcSerializable` 类型来确保值是可序列化的：

```typescript
import type { IpcSerializable } from "electron-json-rpc";

function sendToRenderer(data: IpcSerializable) {
  rpc.publish("event", data); // 类型安全！
}
```

## 通信模式对比

本库支持三种主要的通信模式，可根据安全性和类型安全需求选择：

| 模式             | Preload 定义                                                     | Renderer 使用                       | 安全性            | 类型安全    | 适用场景     |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------- | ----------------- | ----------- | ------------ |
| **自动代理**     | `exposeRpcApi({ contextBridge, ipcRenderer })`                   | `await window.rpc.anyMethod()`      | ⚠️ 任意方法可调用 | ❌ 无类型   | 快速原型开发 |
| **白名单**       | `exposeRpcApi({ contextBridge, ipcRenderer, methods: ["add"] })` | `await window.rpc.add()`            | ✅ 仅允许指定方法 | ❌ 无类型   | 生产环境推荐 |
| **类型化客户端** | 任意模式                                                         | `const api = defineRpcApi<MyApi>()` | ✅ 取决于 preload | ✅ 完整类型 | 大型项目首选 |

### 自动代理模式（最简洁）

```typescript
// Preload - 无需定义方法名
exposeRpcApi({ contextBridge, ipcRenderer });

// Renderer - 直接调用任意方法
await window.rpc.add(1, 2);
```

### 白名单模式（推荐生产使用）

```typescript
// Preload - 只暴露指定方法
exposeRpcApi({ contextBridge, ipcRenderer, methods: ["add", "greet"] });

// Renderer - 白名单方法直接调用
await window.rpc.add(1, 2);
```

### 类型化客户端（完整类型安全）

```typescript
// Renderer - 定义接口获得完整类型
const api = defineRpcApi<{
  add: (a: number, b: number) => number;
  log: (msg: string) => void;
}>();

await api.add(1, 2); // 完全类型化！
```

## 类型化 API

定义你的 API 接口以获得完整的类型安全：

```typescript
// 定义 API 类型
type AppApi = {
  add: (a: number, b: number) => number;
  greet: (name: string) => Promise<string>;
  log: (message: string) => void; // 通知
};

// 创建类型化客户端
import { createTypedRpcClient } from "electron-json-rpc/renderer";

const rpc = createTypedRpcClient<AppApi>();

// 完全类型化！
const sum = await rpc.add(1, 2);
const greeting = await rpc.greet("世界");
rpc.log("这是一个通知");
```

### 接口风格 API (defineRpcApi)

使用 `defineRpcApi` 可以更语义化地定义 API：

```typescript
import { defineRpcApi } from "electron-json-rpc/renderer";

// 定义 API 接口
interface AppApi {
  getUserList(): Promise<{ id: string; name: string }[]>;
  getUser(id: string): Promise<{ id: string; name: string }>;
  deleteUser(id: string): Promise<void>;
  log(message: string): void; // 通知
  dataStream(count: number): ReadableStream<number>;
}

const api = defineRpcApi<AppApi>({ timeout: 10000 });

// 完全类型化的使用方式
const users = await api.getUserList();
const user = await api.getUser("123");
await api.deleteUser("123");
api.log("完成"); // 通知（void 返回）

// 流支持
for await (const n of api.dataStream(10)) {
  console.log(n);
}
```

### 构建器模式 (createRpc)

使用流式构建器模式构建 API，支持类型推断：

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
  .add("log", (message: string) => {}) // void 返回 = 通知
  .stream("dataStream", (count: number) => new ReadableStream<number>())
  .build();

// 完全类型化的使用 - 类型从处理函数签名推断
const users = await api.getUserList();
const user = await api.getUser("123");
await api.deleteUser("123");
api.log("完成"); // 通知（void）

// 流支持
for await (const n of api.dataStream(10)) {
  console.log(n);
}
```

## 调试日志

### 全局调试模式

为所有 RPC 客户端全局启用调试日志：

```typescript
import { setRpcDebug, isRpcDebug } from "electron-json-rpc/renderer";

// 为所有客户端启用调试日志
setRpcDebug(true);

// 检查是否启用了调试
if (isRpcDebug()) {
  console.log("调试模式已激活");
}

// 禁用调试日志
setRpcDebug(false);
```

### 单客户端调试选项

为特定客户端启用调试日志：

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient({
  debug: true, // 为此客户端启用调试日志
  timeout: 10000,
});

// 适用于所有客户端类型
const api = createTypedRpcClient<MyApi>({ debug: true });
const events = createEventBus<AppEvents>({ debug: true });
```

### 自定义日志记录器

提供自定义日志记录函数以完全控制调试输出：

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

### 默认日志记录器输出

使用默认日志记录器（启用 `debug: true`）时，您将看到格式化的控制台输出：

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

### 日志条目类型

日志记录器接收以下类型的条目：

- **`request`** - 发出的 RPC 请求
- **`response`** - 成功的 RPC 响应
- **`error`** - 失败的 RPC 请求
- **`notify`** - 单向通知
- **`stream`** - 流请求
- **`event`** - 事件总线接收到的事件

## 事件总线

事件总线使用发布-订阅模式实现从主进程到渲染进程的实时通信。

### 主进程

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();
rpc.listen();

// 向所有已订阅的渲染进程发布事件
rpc.publish("user-updated", { id: "123", name: "张三" });
rpc.publish("data-changed", { items: [1, 2, 3] });

// 检查订阅者数量
console.log(rpc.getEventSubscribers());
// { "user-updated": 2, "data-changed": 1 }
```

### 渲染进程

```typescript
// 使用暴露的 API（通过 preload）
const unsubscribe = window.rpc.on("user-updated", (data) => {
  console.log("用户已更新:", data);
});

// 使用返回的取消订阅函数
unsubscribe();

// 或手动取消订阅
window.rpc.off("user-updated");

// 单次订阅（首次事件后自动取消订阅）
window.rpc.once("notification", (data) => {
  console.log("收到通知:", data);
});
```

### 类型化事件总线

使用 `createEventBus` 和事件定义实现完整的类型安全：

```typescript
import { createEventBus } from "electron-json-rpc/renderer";

// 定义事件
interface AppEvents {
  "user-updated": { id: string; name: string };
  "data-changed": { items: number[] };
  notification: { message: string; type: "info" | "warning" };
}

const events = createEventBus<AppEvents>();

// 完全类型化！
const unsubscribe = events.on("user-updated", (data) => {
  console.log(data.name); // TypeScript 知道这是 string
});

// 单次订阅
events.once("data-changed", (data) => {
  console.log(data.items); // number[]
});

// 取消订阅
unsubscribe();
```

### 事件总线方法

**主进程 (`RpcServer`):**

- `publish(eventName, data?)` - 向所有已订阅的渲染进程发布事件
- `getEventSubscribers(): Record<string, number>` - 获取每个事件的订阅者数量

**渲染进程:**

- `on(eventName, callback)` - 订阅事件，返回取消订阅函数
- `off(eventName, callback?)` - 取消订阅事件（或事件的所有回调）
- `once(eventName, callback)` - 单次订阅，首次事件后自动取消订阅

## 流式传输

使用 Web 标准 `ReadableStream` 从主进程向渲染进程传输数据：

### 主进程

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

// 注册流方法
rpc.registerStream("counter", async (count: number) => {
  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < count; i++) {
        controller.enqueue({ index: i, value: i * 2 });
        // 模拟异步操作
        await new Promise((r) => setTimeout(r, 100));
      }
      controller.close();
    },
  });
});

// 从 fetch 或其他异步源传输流
rpc.registerStream("fetchData", async (url: string) => {
  const response = await fetch(url);
  return response.body!;
});

rpc.listen();
```

### 渲染进程

```typescript
import { createRpcClient } from "electron-json-rpc/renderer";

const rpc = createRpcClient();

// 使用 for-await-of（推荐）
for await (const chunk of rpc.stream("counter", 10)) {
  console.log(chunk); // { index: 0, value: 0 }, { index: 1, value: 2 }, ...
}

// 直接使用 reader
const stream = rpc.stream("counter", 5);
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value);
}
reader.releaseLock();

// 通过 Response 管道传输
const response = new Response(rpc.stream("fetchData", "https://api.example.com/data"));
const blob = await response.blob();
```

### 流工具

```typescript
import { asyncGeneratorToStream, iterableToStream, readStream } from "electron-json-rpc/stream";

// 将异步生成器转换为流
rpc.registerStream("numbers", () => {
  return asyncGeneratorToStream(async function* () {
    for (let i = 0; i < 10; i++) {
      yield i;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});

// 将数组/可迭代对象转换为流
rpc.registerStream("items", () => {
  return iterableToStream([1, 2, 3, 4, 5]);
});

// 将整个流读入数组（工具函数）
const allChunks = await readStream<number>(stream);
console.log(allChunks); // [1, 2, 3, 4, 5]
```

## 参数验证

你可以为任何 RPC 方法添加参数验证。该库提供了通用的验证器接口，可与任何验证库配合使用。

### 自定义验证器

```typescript
import { RpcServer } from "electron-json-rpc/main";

const rpc = new RpcServer();

// 简单的自定义验证器
rpc.register("divide", (a: number, b: number) => a / b, {
  validate: (params) => {
    const [, divisor] = params as [number, number];
    if (divisor === 0) {
      throw new Error("不能除以零");
    }
  },
});
```

### 使用 Zod

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
    // user 已经验证
    return db.users.create(user);
  },
  {
    validate: (params) => {
      const result = userSchema.safeParse(params[0]);
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
    },
    description: "创建新用户",
  },
);
```

### 使用 TypeBox

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

## API 参考

### 主进程 (`electron-json-rpc/main`)

#### `RpcServer`

```typescript
const rpc = new RpcServer();
```

**方法：**

- `register(name: string, handler: Function, options?)` - 注册 RPC 方法
  - `options.validate?: (params: unknown[]) => void | Promise<void>` - 验证函数
  - `options.description?: string` - 方法描述
- `registerStream(name: string, handler: Function, options?)` - 注册流方法
  - 处理函数应返回 `ReadableStream`
- `publish(eventName: string, data?)` - 向所有已订阅的渲染进程发布事件
- `getEventSubscribers(): Record<string, number>` - 获取每个事件的订阅者数量
- `unregister(name: string)` - 注销方法
- `has(name: string): boolean` - 检查方法是否存在
- `getMethodNames(): string[]` - 获取所有已注册的方法名
- `listen()` - 开始监听 IPC 消息
- `dispose()` - 停止监听并清理

### Preload (`electron-json-rpc/preload`)

#### `exposeRpcApi(options)`

向渲染进程暴露 RPC API。

```typescript
exposeRpcApi({
  contextBridge,
  ipcRenderer,
  methods: ["method1", "method2"], // 可选白名单
  apiName: "rpc", // 默认: 'rpc'
});
```

#### `createPreloadClient(ipcRenderer, timeout?)`

创建用于 preload 脚本的客户端（不向渲染进程暴露）。

### 渲染进程 (`electron-json-rpc/renderer`)

#### `createRpcClient(options?)`

创建无类型 RPC 客户端。

```typescript
const rpc = createRpcClient({
  timeout: 10000, // 默认: 30000ms
  apiName: "rpc", // 默认: 'rpc'
});

await rpc.call("methodName", arg1, arg2);
rpc.notify("notificationMethod", arg1);
rpc.stream("streamMethod", arg1); // 返回 ReadableStream
```

#### `createTypedRpcClient<T>(options?)`

创建具有完整类型安全的类型化 RPC 客户端。

```typescript
type MyApi = {
  foo: (x: number) => string;
};

const rpc = createTypedRpcClient<MyApi>();
await rpc.foo(42);
```

#### `defineRpcApi<T>(options?)`

从接口定义类型化 RPC API（`createTypedRpcClient` 的语义化别名）。

```typescript
interface AppApi {
  getUser(id: string): Promise<User>;
  log(msg: string): void;
}

const api = defineRpcApi<AppApi>();
await api.getUser("123");
api.log("你好");
```

#### `createRpc(options?)`

创建支持类型推断的流式 API 构建器。

```typescript
const api = createRpc()
  .add("getUser", (id: string) => Promise<User>())
  .add("log", (msg: string) => {})
  .stream("dataStream", (n: number) => new ReadableStream<number>())
  .build();

await api.getUser("123");
api.log("你好");
```

#### `useRpcProxy(options?)`

使用 preload 暴露的代理（如果提供了方法白名单）。

#### `createEventBus<T>(options?)`

创建用于主进程实时事件的类型化事件总线。

```typescript
interface AppEvents {
  "user-updated": { id: string; name: string };
  "data-changed": { items: number[] };
}

const events = createEventBus<AppEvents>();

// 使用完整的类型安全订阅
const unsubscribe = events.on("user-updated", (data) => {
  console.log(data.name); // TypeScript 知道这是 string
});

// 取消订阅
unsubscribe();

// 单次订阅
events.once("data-changed", (data) => {
  console.log(data.items);
});
```

### 流工具 (`electron-json-rpc/stream`)

- `isReadableStream(value: unknown): boolean` - 检查值是否为 ReadableStream
- `readStream<T>(stream: ReadableStream<T>): Promise<T[]>` - 将整个流读入数组
- `asyncGeneratorToStream<T>(generator: () => AsyncGenerator<T>): ReadableStream<T>` - 将异步生成器转换为流
- `iterableToStream<T>(iterable: Iterable<T> | AsyncIterable<T>): ReadableStream<T>` - 将可迭代对象转换为流

### 错误处理 (`electron-json-rpc/error`)

- `createJsonRpcError(code, message, data?): JsonRpcError` - 创建 JSON-RPC 错误对象
- `errors` - 预定义错误创建器 (parseError, invalidRequest, methodNotFound, invalidParams, internalError)
- `isJsonRpcError(error: unknown): boolean` - 检查错误是否为 JSON-RPC 错误
- `errorToJsonRpc(error: unknown): JsonRpcError` - 将 Error 对象转换为 JSON-RPC 错误
- `RpcTimeoutError` - 超时错误类
- `isTimeoutError(error: unknown): boolean` - 检查错误是否为超时错误
- `RpcConnectionError` - 连接错误类
- `isConnectionError(error: unknown): boolean` - 检查错误是否为连接错误

## 错误处理

JSON-RPC 错误返回标准错误码：

| Code   | Message          |
| ------ | ---------------- |
| -32700 | Parse error      |
| -32600 | Invalid Request  |
| -32601 | Method not found |
| -32602 | Invalid params   |
| -32603 | Internal error   |

**自定义错误类:**

- **`RpcTimeoutError`** - RPC 调用超时时抛出
- **`RpcConnectionError`** - 与主进程连接丢失时抛出

```typescript
import {
  RpcTimeoutError,
  RpcConnectionError,
  isTimeoutError,
  isConnectionError,
} from "electron-json-rpc/error";

try {
  await rpc.call("someMethod");
} catch (error) {
  if (isTimeoutError(error)) {
    console.log(`请求在 ${error.timeout}ms 后超时`);
  } else if (isConnectionError(error)) {
    console.log("连接丢失:", error.message);
  }
}
```

## 包大小

ESM 打包大小：

| Package          | gzip    |
| ---------------- | ------- |
| Preload          | 3.95 kB |
| Main             | 2.97 kB |
| Debug            | 1.50 kB |
| Renderer/client  | 1.14 kB |
| Renderer/builder | 1.21 kB |
| Renderer/event   | 1.15 kB |
| Stream           | 0.72 kB |
| Event            | 0.43 kB |

## 系统要求

- **Electron**: >= 18.0.0（推荐 >= 32.0.0）
- **Node.js**: >= 16.9.0
- **TypeScript**: >= 5.0.0（如果使用 TypeScript）

## 许可证

MIT
