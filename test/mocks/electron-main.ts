/**
 * Mock for Electron main process
 *
 * This file is aliased to 'electron' in vitest.config.ts for testing
 */

import { vi } from "vitest";

// Module-level state for tracking listeners
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
const webContentsList: any[] = [];

export const ipcMain = {
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel)!.add(listener);
  }),
  removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    const set = listeners.get(channel);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(channel);
      }
    }
  }),
  // Helper for tests to check if a listener is registered
  _getListeners: () => listeners,
  _clear: () => listeners.clear(),
};

export const webContents = {
  getAllWebContents: vi.fn(() => webContentsList),
  // Helper for tests to manipulate the list
  _getList: () => webContentsList,
  _clear: () => (webContentsList.length = 0),
};

// Default export for CommonJS compatibility
export default {
  ipcMain,
  webContents,
};
