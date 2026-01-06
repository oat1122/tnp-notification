import pino from "pino";
import path from "path";
import fs from "fs";
import * as rfs from "rotating-file-stream";
import { config } from "./index";

// สร้าง logs directory ถ้ายังไม่มี
const logsDir = path.resolve(__dirname, "../../../storage/logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ฟังก์ชันสร้างชื่อไฟล์ตามวัน
const logFileName = (time: Date | number, index?: number): string => {
  if (!time) return "app.log";

  const date = time instanceof Date ? time : new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `app-${year}-${month}-${day}.log`;
};

// สร้าง rotating stream
const stream = rfs.createStream(logFileName, {
  interval: "1d", // หมุนไฟล์ทุกวัน
  path: logsDir,
  compress: false, // ไม่ compress ไฟล์เก่า (ถ้าต้องการ compress ใช้ 'gzip')
});

// สร้าง pino logger
export const logger = pino(
  {
    level: config.nodeEnv === "development" ? "debug" : "info",
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    // เขียนลงไฟล์
    { stream },
    // แสดงใน console (development only)
    ...(config.nodeEnv === "development" ? [{ stream: process.stdout }] : []),
  ])
);

export type Logger = typeof logger;
