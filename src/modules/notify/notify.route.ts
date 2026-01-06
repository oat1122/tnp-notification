import { FastifyPluginAsync } from "fastify";
import { config, NotificationPayload, SyncPayload } from "../../core";

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
  fastify.post<{ Body: NotificationPayload }>("/", async (request, reply) => {
    const { user_id, title, message, type } = request.body;

    if (!user_id || !title || !message) {
      return reply.status(400).send({
        success: false,
        error: "Missing required fields: user_id, title, message",
      });
    }

    // Debug: Check how many sockets are in this room
    const roomName = `user_${user_id}`;
    const socketsInRoom = await fastify.io.in(roomName).fetchSockets();
    console.log(`Room ${roomName} has ${socketsInRoom.length} socket(s)`);

    // ส่ง notification ไปยัง user room
    fastify.io.to(roomName).emit("notification", {
      title,
      message,
      type: type || "info",
      timestamp: new Date().toISOString(),
    });

    console.log(`Notification sent to ${roomName}: ${title}`);

    return { success: true, message: "Notification sent" };
  });

  // POST /sync - Sync notification state (unread count) จาก Laravel
  fastify.post<{ Body: SyncPayload }>("/sync", async (request, reply) => {
    const { user_id, unread_count } = request.body;

    if (!user_id || unread_count === undefined) {
      return reply.status(400).send({
        success: false,
        error: "Missing required fields: user_id, unread_count",
      });
    }

    const roomName = `user_${user_id}`;
    const socketsInRoom = await fastify.io.in(roomName).fetchSockets();
    console.log(
      `Sync to ${roomName}: unread_count=${unread_count} (${socketsInRoom.length} socket(s))`
    );

    // ส่ง sync event ไปยัง user room
    fastify.io.to(roomName).emit("notification-sync", {
      unread_count,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: "Sync sent" };
  });
};

export default notifyRoute;
