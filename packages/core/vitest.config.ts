import { defineConfig } from "vitest/config";

// The engines are pure and use only relative imports, so no path plugin is
// needed here — this keeps the shared package free of app-specific config.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
