/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadLocalEnv } from "../../scripts/load-env";

const DEFAULT_PORT = 3000;
const DEFAULT_API_BASE_URL = "http://localhost:3001";

loadLocalEnv({ appDir: "apps/web" });

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
