import { buildApp } from "./app";
import { config, validateConfig } from "./core";

const start = async () => {
  validateConfig();

  const app = buildApp();

  try {
    // เริ่มต้น Server
    await app.listen({ port: config.port, host: config.host });

    console.log(
      `🚀 Notification Server running on port ${config.port} (${config.nodeEnv})`
    );
    console.log(`📡 CORS allowed origins: ${config.corsOrigins.join(", ")}`);

    // --- เพิ่มส่วน Graceful Shutdown ---
    // ฟังก์ชันสำหรับปิด Server อย่างถูกวิธี
    const closeGracefully = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Closing server...`);

      // สั่งปิด Fastify และ Socket.io plugin ที่เชื่อมอยู่
      await app.close();

      console.log("✅ Server closed successfully.");
      process.exit(0);
    };

    // ดักจับสัญญาณเมื่อกด Ctrl+C หรือ Nodemon สั่งรีสตาร์ท
    process.on("SIGINT", () => closeGracefully("SIGINT"));
    process.on("SIGTERM", () => closeGracefully("SIGTERM"));
    // --------------------------------
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
