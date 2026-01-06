import { FastifyPluginAsync } from "fastify";
import { config } from "../../config";

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    return {
      status: "ok",
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoute;
