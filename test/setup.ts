/**
 * Test setup file
 */

import { resetMocks } from "./mocks/electron.js";

// Reset mocks before each test
beforeEach(() => {
  resetMocks();
});

// Clear global state after each test
afterEach(() => {
  // Clean up any global state
  if (typeof globalThis.rpc !== "undefined") {
    delete (globalThis as any).rpc;
  }
});
