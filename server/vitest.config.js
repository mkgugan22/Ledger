import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Server test files share one MongoDB binary download directory. Run
    // files serially so concurrent workers cannot contend for its lock file.
    fileParallelism: false,
    // A clean CI runner must download the MongoDB test binary once.
    hookTimeout: 600000,
    testTimeout: 30000,
  },
});
