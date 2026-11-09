import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { config } from '../config.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction: both can run the same queries. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

let pool: pg.Pool | null = null;
let database: Db | null = null;

export function db(): Db {
  if (!database) {
    pool = new pg.Pool({ connectionString: config().DATABASE_URL, max: 10 });
    // An idle client losing its connection must not crash the server; the pool reconnects.
    pool.on('error', (error) => console.error('[db] idle client error:', error.message));
    database = drizzle(pool, { schema });
  }
  return database;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  database = null;
}

export { schema };
