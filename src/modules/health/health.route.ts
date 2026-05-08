import { FastifyPluginAsync } from "fastify";
import { config } from "../../core";

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    { config: { rateLimit: false } },
    async () => {
      const mem = process.memoryUsage();
      const sockets = await fastify.io.fetchSockets();

      return {
        status: "ok",
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        sockets: sockets.length,
        memory: {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        },
      };
    }
  );
};

export default healthRoute;
