/**
 * Mock Electron APIs for testing
 */

import type { EventEmitter } from "node:events";

type Listener = (...args: unknown[]) => void;

interface MockWebContents {
  id: number;
  send: vitest.Mock<(channel: string, ...args: unknown[]) => void>;
}

class MockIpcRenderer implements EventEmitter {
  private _listeners = new Map<string, Set<Listener>>();

  on = vi.fn((channel: string, listener: Listener): void => {
    if (!this._listeners.has(channel)) {
      this._listeners.set(channel, new Set());
    }
    this._listeners.get(channel)!.add(listener);
  });

  removeListener = vi.fn((channel: string, listener: Listener): void => {
    const listeners = this._listeners.get(channel);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this._listeners.delete(channel);
      }
    }
  });

  send = vi.fn((_channel: string, ..._args: unknown[]): void => {
    // Simulate sending - in real Electron this goes to main process
  });

  // Helper to trigger listeners (for testing)
  _emit(channel: string, ...args: unknown[]): void {
    const listeners = this._listeners.get(channel);
    if (listeners) {
      for (const listener of listeners) {
        listener({}, ...args);
      }
    }
  }

  _clear(): void {
    this._listeners.clear();
  }
}

class MockIpcMain extends MockIpcRenderer {
  private _replyListeners = new Map<string, Listener>();

  reply(channel: string, ...args: unknown[]): void {
    const listener = this._replyListeners.get(channel);
    if (listener) {
      listener({}, ...args);
    }
  }

  // Override on to track reply listeners
  override on = vi.fn((channel: string, listener: Listener): void => {
    super.on(channel, listener);
    // Store listener for reply simulation
    this._replyListeners.set(channel, listener);
  });
}

class MockWebContentsImpl implements MockWebContents {
  id: number;
  send = vi.fn();

  constructor(id: number) {
    this.id = id;
  }
}

const mockWebContentsInstances = new Map<number, MockWebContentsImpl>();

class MockWebContentsAll {
  private _nextId = 1;

  getAllWebContents = vi.fn((): MockWebContents[] => {
    return Array.from(mockWebContentsInstances.values());
  });

  create(id?: number): MockWebContents {
    const webContentsId = id ?? this._nextId++;
    const instance = new MockWebContentsImpl(webContentsId);
    mockWebContentsInstances.set(webContentsId, instance);
    return instance;
  }

  clear(): void {
    mockWebContentsInstances.clear();
    this._nextId = 1;
  }
}

class MockContextBridge {
  exposedInMainWorld = new Map<string, unknown>();

  exposeInMainWorld = vi.fn((name: string, api: Record<string, unknown>): void => {
    this.exposedInMainWorld.set(name, api);
    // Also expose to globalThis for renderer tests
    (globalThis as any)[name] = api;
  });

  clear(): void {
    this.exposedInMainWorld.clear();
  }
}

export const mockIpcMain = new MockIpcMain();
export const mockIpcRenderer = new MockIpcRenderer();
export const mockWebContents = new MockWebContentsAll();
export const mockContextBridge = new MockContextBridge();

export function createMockElectron() {
  return {
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    webContents: mockWebContents,
    contextBridge: mockContextBridge,
  };
}

export function resetMocks(): void {
  mockIpcMain._clear();
  mockIpcRenderer._clear();
  mockWebContents.clear();
  mockContextBridge.clear();
  vi.clearAllMocks();
}

// Make Electron require-able for main/preload tests
vi.mock("electron", () => ({
  default: createMockElectron(),
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
  webContents: mockWebContents,
  contextBridge: mockContextBridge,
}));
