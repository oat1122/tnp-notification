import { Server } from "socket.io";

// Extend Fastify type to include socket.io
declare module "fastify" {
  interface FastifyInstance {
    io: Server;
  }
}

// Socket.io per-connection data set by the auth middleware.
// Populated only for clients that pass HMAC verification.
declare module "socket.io" {
  interface SocketData {
    userId?: string;
  }
}

// Notification payload interface
export interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  type?: string;
}

// Sync payload interface (for syncing notification state)
export interface SyncPayload {
  user_id: string;
  unread_count: number;
}
