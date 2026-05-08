import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim()),
  apiSecretKey: process.env.API_SECRET_KEY || null,
  socketTokenSecret: process.env.SOCKET_TOKEN_SECRET || null,
};

export const validateConfig = (): void => {
  if (config.nodeEnv === "production" && !config.apiSecretKey) {
    throw new Error(
      "API_SECRET_KEY must be set when NODE_ENV=production. " +
        "Without it, /notify/* is publicly writable. " +
        "Set the same value as NOTIFICATION_API_KEY in tnp-backend's .env."
    );
  }
  if (config.nodeEnv === "production" && !config.socketTokenSecret) {
    throw new Error(
      "SOCKET_TOKEN_SECRET must be set when NODE_ENV=production. " +
        "Without it, socket auth verification cannot run and any client " +
        "could join any user's notification room. " +
        "Set the same value as NOTIFICATION_TOKEN_SECRET in tnp-backend's .env."
    );
  }
};
