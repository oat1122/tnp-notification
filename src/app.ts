import Fastify from "fastify";
import cors from "@fastify/cors";
import socketPlugin from "./plugins/socket";
import healthRoute from "./routes/health";
import notifyRoute from "./routes/notify";
import { config } from "./config";

// Import types to extend FastifyInstance
import "./types";

export const buildApp = () => {
  const app = Fastify({
    logger: config.nodeEnv === "development",
  });

  // Register Plugins
  app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  app.register(socketPlugin);

  // Register Routes
  app.register(healthRoute, { prefix: "/health" });
  app.register(notifyRoute, { prefix: "/notify" });

  return app;
};
