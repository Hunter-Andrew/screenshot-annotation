import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Fabric is only imported on demand (src/canvas/kit.ts); pre-bundle it so the dev server does not
  // discover it late and reload the page under a running editor (or an e2e test).
  optimizeDeps: { include: ["fabric"] },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
