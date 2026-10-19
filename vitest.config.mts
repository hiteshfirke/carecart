import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Tests never touch the live database: they use TEST_DATABASE_URL, or none (the DB suite then skips).
  env.DATABASE_URL = env.TEST_DATABASE_URL ?? "";
  return {
    test: {
      include: ["lib/**/*.test.ts"],
      environment: "node",
      env,
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    },
  };
});
