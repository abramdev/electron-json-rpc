/**
 * Event Bus utilities for electron-json-rpc
 *
 * Implements publish-subscribe pattern for main-to-renderer communication
 */

/**
 * IPC channel name for event bus messages
 */
export const EVENT_CHANNEL = "json-rpc-events";

/**
 * Message types for event bus communication
 */
export type EventMessageType = "subscribe" | "unsubscribe" | "event";

/**
 * Event bus message sent between main and renderer
 */
export interface EventMessage {
  type: EventMessageType;
  eventName: string;
  data?: unknown;
}

/**
 * Subscribe message sent from renderer to main
 */
export interface SubscribeMessage extends EventMessage {
  type: "subscribe";
  eventName: string;
}

/**
 * Unsubscribe message sent from renderer to main
 */
export interface UnsubscribeMessage extends EventMessage {
  type: "unsubscribe";
  eventName: string;
}

/**
 * Event message sent from main to renderer
 */
export interface EventEmitMessage extends EventMessage {
  type: "event";
  eventName: string;
  data?: unknown;
}

/**
 * Create a subscribe message
 */
export function createSubscribeMessage(eventName: string): SubscribeMessage {
  return {
    type: "subscribe",
    eventName,
  };
}

/**
 * Create an unsubscribe message
 */
export function createUnsubscribeMessage(eventName: string): UnsubscribeMessage {
  return {
    type: "unsubscribe",
    eventName,
  };
}

/**
 * Create an event emit message
 */
export function createEventMessage(eventName: string, data?: unknown): EventEmitMessage {
  return {
    type: "event",
    eventName,
    data,
  };
}

/**
 * Check if a message is an event emit message
 */
export function isEventMessage(message: EventMessage): message is EventEmitMessage {
  return message.type === "event";
}

/**
 * Check if a message is a subscribe message
 */
export function isSubscribeMessage(message: EventMessage): message is SubscribeMessage {
  return message.type === "subscribe";
}

/**
 * Check if a message is an unsubscribe message
 */
export function isUnsubscribeMessage(message: EventMessage): message is UnsubscribeMessage {
  return message.type === "unsubscribe";
}
