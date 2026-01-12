import { config } from "@/config";
import logger from "@/utils/logger";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("connect", (client) => {
  logger.debug("New database client connected");
});

pool.on("acquire", (client) => {
  logger.trace("Database client acquired from pool");
});

pool.on("remove", (client) => {
  logger.debug("Database client removed from pool");
});

pool.on("error", (err, client) => {
  logger.error({ error: err }, "Unexpected database pool error");
});

export async function testConnection(): Promise<void> {
  try {
    const result = await pool.query("SELECT NOW() as current_time");
    logger.info(
      { currentTime: result.rows[0].current_time },
      "Database connection successful"
    );
  } catch (error) {
    logger.error({ error }, "Database connection failed");
    throw new Error("Failed to connect to database");
  }
}

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug(
      {
        query: text,
        duration,
        rows: result.rowCount,
      },
      "Query executed"
    );

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    logger.error(
      {
        error,
        query: text,
        params,
        duration,
      },
      "Query executed"
    );

    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  logger.debug("Database client acquired");
  return client;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query("BEGIN");
    logger.debug("Transaction started");

    const result = await callback(client);

    await client.query("COMMIT");
    logger.debug("Transaction committed");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.warn({ error }, "Transaction rolled back");

    throw error;
  } finally {
    client.release();
    logger.debug("Database client released");
  }
}

export async function transaction(
  queries: Array<{ text: string; params?: unknown[] }>
) {
  return withTransaction(async (client) => {
    const results = [];

    for (const { text, params } of queries) {
      const result = await client.query(text, params);
      results.push(result);
    }

    return results;
  });
}

export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info("Database pool closed");
  } catch (error) {
    logger.error({ error }, "Error closing database pool");
    throw error;
  }
}

export function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export function isDatabaseConnectionError(error: any): boolean {
  if (!error) return false;

  const networkErrors = [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ECONNRESET",
    "ENOTFOUND",
  ];
  if (networkErrors.includes(error.code)) {
    return true;
  }

  const pgConnectionErrors = [
    "57P01",
    "57P02",
    "57P03",
    "08000",
    "08003",
    "08006",
  ];
  if (pgConnectionErrors.includes(error.code)) {
    return true;
  }

  return false;
}
