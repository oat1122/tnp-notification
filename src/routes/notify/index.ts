import { FastifyPluginAsync } from "fastify";
import { NotificationPayload } from "../../types";
import { config } from "../../config";

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
};

export default notifyRoute;
