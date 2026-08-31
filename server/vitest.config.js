import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // A clean CI runner must download the MongoDB test binary once.
    hookTimeout: 600000,
    testTimeout: 30000,
  },
});
