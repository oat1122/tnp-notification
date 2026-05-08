import { FastifyPluginAsync } from "fastify";
import { config, NotificationPayload, SyncPayload } from "../../core";
import { notifySchema, syncSchema } from "./notify.schema";

const notifyRoute: FastifyPluginAsync = async (fastify) => {
  // Middleware: API Key validation (production only)
  fastify.addHook("onRequest", async (request, reply) => {
    // Only validate in production with API key configured
    if (config.nodeEnv === "production" && config.apiSecretKey) {
      const apiKey = request.headers["x-api-key"];
      if (apiKey !== config.apiSecretKey) {
        return reply
          .status(401)
          .send({ success: false, error: "Unauthorized" });
      }
    }
  });

  // POST / - รับ notification จาก Laravel
  fastify.post<{ Body: NotificationPayload }>(
    "/",
    { schema: notifySchema },
    async (request) => {
      const { user_id, title, message, type } = request.body;
      const roomName = `user_${user_id}`;

      if (config.nodeEnv === "development") {
        const socketsInRoom = await fastify.io.in(roomName).fetchSockets();
        request.log.debug(
          { roomName, sockets: socketsInRoom.length },
          "room socket count"
        );
      }

      fastify.io.to(roomName).emit("notification", {
        title,
        message,
        type: type || "info",
        timestamp: new Date().toISOString(),
      });

      request.log.info({ roomName, title }, "notification sent");

      return { success: true, message: "Notification sent" };
    }
  );

  // POST /sync - Sync notification state (unread count) จาก Laravel
  fastify.post<{ Body: SyncPayload }>(
    "/sync",
    { schema: syncSchema },
    async (request) => {
      const { user_id, unread_count } = request.body;
      const roomName = `user_${user_id}`;

      if (config.nodeEnv === "development") {
        const socketsInRoom = await fastify.io.in(roomName).fetchSockets();
        request.log.debug(
          { roomName, unread_count, sockets: socketsInRoom.length },
          "sync socket count"
        );
      }

      fastify.io.to(roomName).emit("notification-sync", {
        unread_count,
        timestamp: new Date().toISOString(),
      });

      request.log.info({ roomName, unread_count }, "notification sync sent");

      return { success: true, message: "Sync sent" };
    }
  );
};

export default notifyRoute;
