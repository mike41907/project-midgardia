import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  resolve: {
    alias: {
      "@midgardia/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@midgardia/game-data": path.resolve(__dirname, "../../packages/game-data/src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
