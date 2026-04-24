import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@groundedos/core": resolve(__dirname, "packages/core/src"),
      "@groundedos/rag": resolve(__dirname, "packages/rag/src"),
      "@groundedos/etl": resolve(__dirname, "packages/etl/src"),
      "@groundedos/memory": resolve(__dirname, "packages/memory/src"),
      "@groundedos/observability": resolve(__dirname, "packages/observability/src"),
      "@groundedos/agents": resolve(__dirname, "packages/agents/src"),
      "@groundedos/safety": resolve(__dirname, "packages/safety/src"),
      "@groundedos/evals": resolve(__dirname, "packages/evals/src"),
    },
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: true,
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          react: {
            runtime: "automatic",
          },
        },
      },
    }),
  ],
});
