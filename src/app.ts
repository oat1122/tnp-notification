import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, logger } from "./core";
import { socketPlugin } from "./plugins";
import { healthRoute, notifyRoute } from "./modules";

// Import types to extend FastifyInstance
import "./core/types";

export const buildApp = () => {
  const app = Fastify({
    loggerInstance: logger,
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
