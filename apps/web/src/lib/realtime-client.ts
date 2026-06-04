import {
  AgentEventSchema,
  type AgentEvent,
} from "@smart-cs-agent/shared";
import { io, type Socket } from "socket.io-client";

export const DEFAULT_WS_BASE_URL = "http://localhost:4100";
export const AGENT_EVENT_NAME = "agent:event";
export const AGENT_PING_EVENT_NAME = "agent:ping";
export const AGENT_PONG_EVENT_NAME = "agent:pong";

export type AgentEventHandler = (event: AgentEvent) => void;
export type ConnectionStateHandler = (connected: boolean) => void;

export type AgentPingPayload = {
  timestamp?: string;
};

export type AgentPongResponse = {
  timestamp: string;
};

export type RealtimeClientOptions = {
  url?: string;
  autoConnect?: boolean;
};

export type RealtimeClient = {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  onAgentEvent: (handler: AgentEventHandler) => () => void;
  onConnectionChange: (handler: ConnectionStateHandler) => () => void;
  ping: (payload?: AgentPingPayload) => Promise<AgentPongResponse>;
};

type ServerToClientEvents = {
  [AGENT_EVENT_NAME]: (event: unknown) => void;
  [AGENT_PONG_EVENT_NAME]: (response: unknown) => void;
};

type ClientToServerEvents = {
  [AGENT_PING_EVENT_NAME]: (payload?: AgentPingPayload) => void;
};

type AgentSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function resolveWsBaseUrl(
  value = process.env.NEXT_PUBLIC_WS_URL,
): string {
  const baseUrl = value?.trim() || DEFAULT_WS_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

function parseAgentPongResponse(payload: unknown): AgentPongResponse {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "timestamp" in payload &&
    typeof payload.timestamp === "string"
  ) {
    return { timestamp: payload.timestamp };
  }

  throw new Error("Invalid agent:pong payload");
}

export function createRealtimeClient(
  options: RealtimeClientOptions = {},
): RealtimeClient {
  const socket: AgentSocket = io(resolveWsBaseUrl(options.url), {
    autoConnect: options.autoConnect ?? false,
    transports: ["websocket"],
  });

  const agentEventHandlers = new Set<AgentEventHandler>();
  const connectionStateHandlers = new Set<ConnectionStateHandler>();

  socket.on(AGENT_EVENT_NAME, (payload) => {
    const event = AgentEventSchema.parse(payload);
    agentEventHandlers.forEach((handler) => handler(event));
  });

  socket.on("connect", () => {
    connectionStateHandlers.forEach((handler) => handler(true));
  });

  socket.on("disconnect", () => {
    connectionStateHandlers.forEach((handler) => handler(false));
  });

  return {
    connect() {
      socket.connect();
    },
    disconnect() {
      socket.disconnect();
    },
    isConnected() {
      return socket.connected;
    },
    onAgentEvent(handler) {
      agentEventHandlers.add(handler);
      return () => {
        agentEventHandlers.delete(handler);
      };
    },
    onConnectionChange(handler) {
      connectionStateHandlers.add(handler);
      return () => {
        connectionStateHandlers.delete(handler);
      };
    },
    ping(payload) {
      return new Promise<AgentPongResponse>((resolve, reject) => {
        socket.once(AGENT_PONG_EVENT_NAME, (response) => {
          try {
            resolve(parseAgentPongResponse(response));
          } catch (error) {
            reject(error);
          }
        });

        socket.emit(AGENT_PING_EVENT_NAME, payload);
      });
    },
  };
}
