import { Server } from "socket.io";

// Extend Fastify type to include socket.io
declare module "fastify" {
  interface FastifyInstance {
    io: Server;
  }
}

// Notification payload interface
export interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  type?: string;
}
