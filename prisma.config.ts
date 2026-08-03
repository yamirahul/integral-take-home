import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `types` is required explicitly: ts-node compiles seed.ts in isolation, so it does not
    // pick up the ambient Node globals that the root tsconfig's `include` provides.
    seed: 'ts-node --compiler-options {"module":"CommonJS","types":["node"]} prisma/seed.ts',
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
