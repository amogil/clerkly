// Requirements: user-data-isolation.7.1
// Drizzle Kit configuration for migrations and schema management

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/main/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/clerkly.db',
  },
} satisfies Config;
