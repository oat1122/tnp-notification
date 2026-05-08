import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config, logger } from "./core";
import { socketPlugin } from "./plugins";
import { healthRoute, notifyRoute } from "./modules";

// Import types to extend FastifyInstance
import "./core/types";

export const buildApp = () => {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 10 * 1024,
  });

  // CSP off — this service serves JSON + Socket.io upgrades, no HTML.
  app.register(helmet, { contentSecurityPolicy: false });

  // Per-IP throttle. Health route opts out via { config: { rateLimit: false } }.
  // Generous ceiling for Laravel bursts (notifyMany with many recipients).
  app.register(rateLimit, {
    max: 200,
    timeWindow: "1 second",
  });

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
