import fp from "fastify-plugin";
import { Server } from "socket.io";
import { config } from "../config";

export default fp(async (fastify) => {
  // Manual Socket.io integration
  const io = new Server(fastify.server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
  });

  // Decorate fastify instance with io
  fastify.decorate("io", io);

  // Socket.io connection logic
  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Join user room
    socket.on("join_user", (userId: string) => {
      socket.join(`user_${userId}`);
      console.log(`👤 Socket ${socket.id} joined room user_${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  // Cleanup on close
  fastify.addHook("onClose", (fastify, done) => {
    fastify.io.close();
    done();
  });
});
