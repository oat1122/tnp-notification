import fp from "fastify-plugin";
import { Server } from "socket.io";
import { config } from "../../core";
import { verifySocketAuth } from "./auth";

export default fp(async (fastify) => {
  const io = new Server(fastify.server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
  });

  fastify.decorate("io", io);

  // Auth middleware (backward-compat phase).
  //
  // Behavior — see .claude/rules/socket-auth.md:
  //   - If client supplies handshake.auth { token, user_id, exp } and HMAC
  //     verifies, set socket.data.userId so the connection handler can auto-join.
  //   - If client omits auth entirely, allow the connection but log a warning
  //     so we can spot legacy clients during the migration window. They fall
  //     through to the deprecated `join_user` path.
  //   - If auth IS supplied but invalid (expired, malformed, bad signature),
  //     reject — don't downgrade to legacy. A bad token signals an attempted
  //     forge, not a stale client.
  io.use((socket, next) => {
    const auth = socket.handshake.auth;

    if (!auth || Object.keys(auth).length === 0) {
      fastify.log.warn(
        { socketId: socket.id },
        "socket connected without auth payload (legacy client)"
      );
      return next();
    }

    if (!config.socketTokenSecret) {
      // Auth was supplied but server has no secret configured. In dev this
      // can happen; in prod validateConfig() already prevents boot. Log and
      // allow through to legacy path so we don't break dev.
      fastify.log.warn(
        { socketId: socket.id },
        "socket auth supplied but SOCKET_TOKEN_SECRET not configured"
      );
      return next();
    }

    const result = verifySocketAuth(auth, config.socketTokenSecret);
    if (!result.ok) {
      fastify.log.warn(
        { socketId: socket.id, reason: result.reason },
        "socket auth rejected"
      );
      return next(new Error(`AUTH_${result.reason}`));
    }

    socket.data.userId = result.userId;
    next();
  });

  io.on("connection", (socket) => {
    const verifiedUserId = socket.data.userId;

    if (verifiedUserId) {
      const roomName = `user_${verifiedUserId}`;
      socket.join(roomName);
      fastify.log.info(
        { socketId: socket.id, roomName, mode: "verified" },
        "socket connected and auto-joined room"
      );
    } else {
      fastify.log.info(
        { socketId: socket.id, mode: "legacy" },
        "socket connected (legacy, awaiting join_user)"
      );

      // Legacy path — kept for backward-compat during migration.
      // To be removed once all FE clients send auth handshake.
      socket.on("join_user", (userId: string) => {
        const roomName = `user_${userId}`;
        socket.join(roomName);
        fastify.log.warn(
          { socketId: socket.id, roomName },
          "socket joined room via legacy join_user (no auth verification)"
        );
      });
    }

    socket.on("disconnect", () => {
      fastify.log.info({ socketId: socket.id }, "socket disconnected");
    });
  });

  fastify.addHook("onClose", (fastify, done) => {
    fastify.io.close();
    done();
  });
});
