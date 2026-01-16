/**
 * Stream utilities for electron-json-rpc
 *
 * Shared constants and utilities for streaming support
 */

/**
 * IPC channel name for stream chunks
 */
export const STREAM_CHANNEL = "json-rpc-stream";

/**
 * Generate unique stream ID
 */
let streamIdCounter = 0;
export function generateStreamId(): string {
  return `stream_${++streamIdCounter}_${Date.now()}`;
}

/**
 * Create a stream chunk message
 */
export function createStreamChunk(
  streamId: string | number,
  type: "chunk" | "end" | "error",
  data?: unknown,
): {
  streamId: string | number;
  type: "chunk" | "end" | "error";
  data?: unknown;
} {
  return { streamId, type, data };
}

/**
 * Check if a value is a ReadableStream
 */
export function isReadableStream(value: unknown): value is ReadableStream {
  return (
    typeof value === "object" &&
    value !== null &&
    "getReader" in value &&
    typeof (value as ReadableStream).getReader === "function"
  );
}

/**
 * Read entire stream into an array
 */
export async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

/**
 * Convert async generator to ReadableStream
 */
export function asyncGeneratorToStream<T>(generator: () => AsyncGenerator<T>): ReadableStream<T> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const value of generator()) {
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Convert array to ReadableStream
 */
export function iterableToStream<T>(iterable: Iterable<T> | AsyncIterable<T>): ReadableStream<T> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const value of iterable) {
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
