import http from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { createSocketServer } from "./socket";

const httpServer = http.createServer(createApp(prisma));
const socketServer = createSocketServer(httpServer, prisma);

httpServer.listen(config.port, "0.0.0.0", () => {
  console.log(`[midgardia] server listening on http://localhost:${config.port}`);
  console.log(`[midgardia] client origin allow-list: ${config.clientOrigins.join(", ")}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[midgardia] ${signal}; saving and shutting down.`);
  socketServer.close();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
