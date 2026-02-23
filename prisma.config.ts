import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',

  // Database URL for Prisma CLI commands (migrate, studio, etc.)
  datasource: {
    url: process.env.DATABASE_URL,
  },

  // Migration configuration
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
