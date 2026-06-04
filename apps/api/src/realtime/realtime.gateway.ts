import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { AgentEvent } from "@smart-cs-agent/shared";
import type { Server } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  private server!: Server;

  publishAgentEvent(event: AgentEvent) {
    this.server.emit("agent:event", event);
  }

  @SubscribeMessage("agent:ping")
  handlePing(@MessageBody() payload?: { timestamp?: string }) {
    return {
      event: "agent:pong",
      data: {
        timestamp: payload?.timestamp ?? new Date().toISOString(),
      },
    };
  }
}
