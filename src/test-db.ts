import {
  closePool,
  getPoolStats,
  query,
  testConnection,
  withTransaction,
} from "./db";
import logger from "./utils/logger";

async function main() {
  try {
    logger.info("Testing database connection...");

    // Test connection
    await testConnection();

    // Test simple query
    logger.info("Testing simple query...");
    const timeResult = await query("SELECT NOW() as time");
    logger.info({ time: timeResult.rows[0].time }, "Simple query success");

    // Test counting tables
    logger.info("Testing table count...");
    const tablesResult = await query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    logger.info({ tableCount: tablesResult.rows[0].count }, "Found tables");

    // Test transaction
    logger.info("Testing transaction...");
    await withTransaction(async (client) => {
      await client.query("SELECT 1");
      await client.query("SELECT 2");
      logger.info("Transaction success");
    });

    // Test pool stats
    logger.info(getPoolStats(), "Pool stats");

    logger.info("All database tests passed");
  } catch (error) {
    logger.error({ error }, "Database test failed");
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
