/**
 * Tests for stream utilities
 */

import { describe, it, expect } from "vitest";
import {
  generateStreamId,
  createStreamChunk,
  isReadableStream,
  readStream,
  asyncGeneratorToStream,
  iterableToStream,
} from "../src/stream.js";

describe("stream utilities", () => {
  describe("generateStreamId", () => {
    it("generates unique stream IDs", () => {
      const id1 = generateStreamId();
      const id2 = generateStreamId();
      expect(id1).not.toBe(id2);
    });

    it("generates IDs with stream_ prefix", () => {
      const id = generateStreamId();
      expect(id).toMatch(/^stream_\d+_/);
    });
  });

  describe("createStreamChunk", () => {
    it("creates chunk type with data", () => {
      const chunk = createStreamChunk("stream-1", "chunk", { value: 42 });
      expect(chunk).toEqual({
        streamId: "stream-1",
        type: "chunk",
        data: { value: 42 },
      });
    });

    it("creates end type without data", () => {
      const chunk = createStreamChunk("stream-1", "end");
      expect(chunk).toEqual({
        streamId: "stream-1",
        type: "end",
      });
    });

    it("creates error type with error data", () => {
      const error = { code: -32603, message: "Internal error" };
      const chunk = createStreamChunk("stream-1", "error", error);
      expect(chunk).toEqual({
        streamId: "stream-1",
        type: "error",
        data: error,
      });
    });
  });

  describe("isReadableStream", () => {
    it("returns true for ReadableStream", () => {
      const stream = new ReadableStream();
      expect(isReadableStream(stream)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isReadableStream(null)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isReadableStream("string")).toBe(false);
      expect(isReadableStream(123)).toBe(false);
      expect(isReadableStream(undefined)).toBe(false);
    });

    it("returns false for objects without getReader", () => {
      expect(isReadableStream({})).toBe(false);
      expect(isReadableStream({ read: () => {} })).toBe(false);
    });

    it("returns false for objects with non-function getReader", () => {
      expect(isReadableStream({ getReader: "not a function" } as any)).toBe(false);
    });
  });

  describe("readStream", () => {
    it("reads all chunks from a stream", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(1);
          controller.enqueue(2);
          controller.enqueue(3);
          controller.close();
        },
      });

      const chunks = await readStream(stream);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it("handles empty streams", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const chunks = await readStream(stream);
      expect(chunks).toEqual([]);
    });

    it("handles undefined values", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(undefined);
          controller.enqueue(1);
          controller.close();
        },
      });

      const chunks = await readStream(stream);
      expect(chunks).toEqual([1]);
    });

    it("releases reader lock even on error", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(1);
          controller.error(new Error("Stream error"));
        },
      });

      await expect(readStream(stream)).rejects.toThrow("Stream error");
    });
  });

  describe("asyncGeneratorToStream", () => {
    it("converts async generator to stream", async () => {
      async function* generateNumbers() {
        yield 1;
        yield 2;
        yield 3;
      }

      const stream = asyncGeneratorToStream(generateNumbers);
      const chunks = await readStream(stream);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it("handles empty generator", async () => {
      async function* generateNothing() {
        // Empty
      }

      const stream = asyncGeneratorToStream(generateNothing);
      const chunks = await readStream(stream);
      expect(chunks).toEqual([]);
    });

    it("propagates generator errors", async () => {
      async function* generateError() {
        yield 1;
        throw new Error("Generator error");
      }

      const stream = asyncGeneratorToStream(generateError);
      await expect(readStream(stream)).rejects.toThrow("Generator error");
    });
  });

  describe("iterableToStream", () => {
    it("converts array to stream", async () => {
      const stream = iterableToStream([1, 2, 3]);
      const chunks = await readStream(stream);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it("converts Set to stream", async () => {
      const stream = iterableToStream(new Set([1, 2, 3]));
      const chunks = await readStream(stream);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it("handles empty iterable", async () => {
      const stream = iterableToStream([]);
      const chunks = await readStream(stream);
      expect(chunks).toEqual([]);
    });

    it("converts async iterable to stream", async () => {
      async function* asyncNumbers() {
        yield 1;
        yield 2;
        yield 3;
      }

      const stream = iterableToStream(asyncNumbers());
      const chunks = await readStream(stream);
      expect(chunks).toEqual([1, 2, 3]);
    });

    it("propagates iterable errors", async () => {
      async function* asyncError() {
        yield 1;
        throw new Error("Iterable error");
      }

      const stream = iterableToStream(asyncError());
      await expect(readStream(stream)).rejects.toThrow("Iterable error");
    });
  });
});
