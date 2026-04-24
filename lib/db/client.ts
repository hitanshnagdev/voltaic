import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Persist the postgres client across Next.js dev-mode hot reloads so we don't
// exhaust the Neon connection pool on every change.
const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

let cached: DB | null = null;

function getDb(): DB {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    // Thrown at first real use, not at module load. This lets `next build`
    // collect page data (and tests import `db`) without production secrets,
    // while still failing loudly the moment an actual query is issued.
    throw new Error("DATABASE_URL is not set");
  }

  const client =
    globalForDb.client ??
    postgres(url, {
      max: 10,
      prepare: false,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.client = client;
  }

  cached = drizzle(client, { schema });
  return cached;
}

// Proxy forwards every access to a lazily-initialized drizzle instance. The
// connection isn't established — and DATABASE_URL isn't read — until the first
// method call (`db.select()`, `db.transaction(...)`, etc.).
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as DB;

export { schema };
